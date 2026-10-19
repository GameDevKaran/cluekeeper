import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { ObjectStoryStore, GenerationConflict, MAX_SESSION_BYTES, type ConditionalObjects, type ObjectSnapshot } from '../src/server/object-store.js';
import { MAX_HISTORY, MAX_RETRIES, StorageUnavailable } from '../src/server/persistence.js';
import { RETENTION_MS } from '../src/server/security.js';
import { createApp } from '../src/server/app.js';
import type { Command } from '../src/domain/index.js';

// Explicit storage double: these tests do not claim live Google Cloud verification.
class MemoryObjects implements ConditionalObjects {
  records = new Map<string, ObjectSnapshot>();
  sequence = 9007199254740993n;
  unavailable = false;
  loseNextWriteResponse = false;
  beforeRemove?: () => Promise<void>;
  async read(name: string) {
    if (this.unavailable) throw new Error('PRIVATE PROVIDER DETAILS');
    return structuredClone(this.records.get(name) ?? null);
  }
  async write(name: string, body: string, generation: string) {
    await Promise.resolve();
    if (this.unavailable) throw new Error('PRIVATE PROVIDER DETAILS');
    if ((this.records.get(name)?.generation ?? '0') !== generation) throw new GenerationConflict();
    this.records.set(name, { body, generation: String(++this.sequence) });
    if (this.loseNextWriteResponse) { this.loseNextWriteResponse = false; throw new Error('Response lost AFTER commit'); }
  }
  async remove(name: string, generation: string) {
    const hook = this.beforeRemove; this.beforeRemove = undefined; await hook?.();
    if (this.unavailable) throw new Error('PRIVATE PROVIDER DETAILS');
    if (this.records.get(name)?.generation !== generation) throw new GenerationConflict();
    this.records.delete(name);
  }
}
const owner = createHash('sha256').update('browser-owner').digest('hex');
const other = createHash('sha256').update('other-browser').digest('hex');
const errorCode = (code: string) => (error: any) => error.code === code;

test('concurrent bootstraps return one persisted mystery and fresh stores preserve owner isolation', async () => {
  const objects = new MemoryObjects(); const a = new ObjectStoryStore(objects); const b = new ObjectStoryStore(objects);
  const [first, second] = await Promise.all([a.create(owner), b.create(owner)]);
  assert.equal(first.id, second.id); assert.equal(objects.records.size, 1);
  await a.command(owner, { type: 'inspect', targetId: 'display-plinth' }, 0, 'inspect', first.id);
  a.close(); const reopened = new ObjectStoryStore(objects);
  assert.deepEqual((await reopened.get(owner))?.discoveredClueIds, ['transfer-tab']);
  assert.equal(await reopened.get(other), null);
  assert.ok(BigInt([...objects.records.values()][0].generation) > BigInt(Number.MAX_SAFE_INTEGER));
});

test('competing instance mutations have one winner and one stale revision', async () => {
  const objects = new MemoryObjects(); const a = new ObjectStoryStore(objects); const b = new ObjectStoryStore(objects);
  const { id } = await a.create(owner);
  const results = await Promise.allSettled([
    a.command(owner, { type: 'hint' }, 0, 'one', id),
    b.command(owner, { type: 'pause' }, 0, 'two', id),
  ]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal((results.find(result => result.status === 'rejected') as PromiseRejectedResult).reason.code, 'STALE_REVISION');
  assert.equal((await b.get(owner))?.revision, 1);
});

test('concurrent identical retries commit once and retain original command plus revision identity', async () => {
  const objects = new MemoryObjects(); const a = new ObjectStoryStore(objects); const b = new ObjectStoryStore(objects);
  const { id } = await a.create(owner); const command = { type: 'hint' as const };
  const results = await Promise.all([a.command(owner, command, 0, '__proto__', id), b.command(owner, command, 0, '__proto__', id)]);
  assert.deepEqual(results.map(session => session.revision), [1, 1]);
  await b.command(owner, { type: 'pause' }, 1, 'later', id);
  assert.equal((await a.command(owner, command, 0, '__proto__', id)).phase, 'PAUSED');
  await assert.rejects(a.command(owner, command, 2, '__proto__', id), errorCode('KEY_REUSED'));
  await assert.rejects(a.command(owner, { type: 'pause' }, 0, '__proto__', id), errorCode('KEY_REUSED'));
  await assert.rejects(a.command(owner, command, 0, '__proto__', randomUUID()), errorCode('STALE_SESSION'));
});

test('response loss after commit is recoverable without a duplicate action', async () => {
  const objects = new MemoryObjects(); const store = new ObjectStoryStore(objects); const { id } = await store.create(owner);
  objects.loseNextWriteResponse = true;
  await assert.rejects(store.command(owner, { type: 'hint' }, 0, 'hint', id), StorageUnavailable);
  assert.equal((await store.command(owner, { type: 'hint' }, 0, 'hint', id)).revision, 1);
});

test('deletion and stale retries racing a replacement cannot erase or mutate the new mystery', async () => {
  const objects = new MemoryObjects(); const a = new ObjectStoryStore(objects); const b = new ObjectStoryStore(objects);
  const { id } = await a.create(owner); await a.command(owner, { type: 'hint' }, 0, 'old-key', id);
  let replacement = '';
  objects.beforeRemove = async () => { objects.records.clear(); replacement = (await b.create(owner)).id; };
  await assert.rejects(a.clear(owner, id), errorCode('STALE_SESSION'));
  await assert.rejects(a.command(owner, { type: 'hint' }, 0, 'old-key', id), errorCode('STALE_SESSION'));
  assert.equal((await b.get(owner))?.id, replacement);
  await b.clear(owner, replacement); await b.clear(owner, replacement);
  assert.equal(await b.get(owner), null);
});

test('absolute expiry is unchanged by late commands or retries, and expired commands fail', async () => {
  const objects = new MemoryObjects(); let now = 1000; const store = new ObjectStoryStore(objects, () => now);
  const { id } = await store.create(owner); const expiry = now + RETENTION_MS;
  now = expiry - 1;
  await store.command(owner, { type: 'hint' }, 0, 'hint', id);
  await store.command(owner, { type: 'hint' }, 0, 'hint', id);
  assert.equal(JSON.parse([...objects.records.values()][0].body).expires, expiry);
  now = expiry;
  await assert.rejects(store.command(owner, { type: 'pause' }, 1, 'pause', id), errorCode('NO_SESSION'));
  assert.equal(await store.get(owner), null); assert.equal(objects.records.size, 0);
  assert.notEqual((await store.create(owner)).id, id);
});

test('expired cleanup racing a replacement preserves its new absolute expiry and state', async () => {
  const objects = new MemoryObjects(); let now = 1000;
  const a = new ObjectStoryStore(objects, () => now); const b = new ObjectStoryStore(objects, () => now);
  await a.create(owner); now += RETENTION_MS; let replacement = '';
  objects.beforeRemove = async () => { objects.records.clear(); replacement = (await b.create(owner)).id; };
  assert.equal((await a.get(owner))?.id, replacement);
  assert.equal(JSON.parse([...objects.records.values()][0].body).expires, now + RETENTION_MS);
});

test('history and retry compaction preserve clues, current retry safety and continued play', async () => {
  const objects = new MemoryObjects(); const store = new ObjectStoryStore(objects); const { id } = await store.create(owner);
  await store.command(owner, { type: 'inspect', targetId: 'display-plinth' }, 0, 'inspect', id);
  for (let revision = 1; revision <= MAX_RETRIES; revision++) await store.command(owner, { type: 'hint' }, revision, `hint-${revision}`, id);
  const state = (await store.get(owner))!;
  assert.equal(state.history.length, MAX_HISTORY); assert.equal(state.revision, MAX_RETRIES + 1);
  assert.deepEqual(state.discoveredClueIds, ['transfer-tab']);
  assert.equal(Object.keys(JSON.parse([...objects.records.values()][0].body).operations).length, MAX_RETRIES);
  await assert.rejects(store.command(owner, { type: 'inspect', targetId: 'display-plinth' }, 0, 'inspect', id), errorCode('STALE_REVISION'));
  assert.equal((await store.command(owner, { type: 'hint' }, MAX_RETRIES, `hint-${MAX_RETRIES}`, id)).revision, MAX_RETRIES + 1);
  assert.equal((await store.command(owner, { type: 'pause' }, state.revision, 'pause', id)).phase, 'PAUSED');
});

test('unreadable, invalid or oversized records fail closed without replacing saved data', async () => {
  const objects = new MemoryObjects(); const store = new ObjectStoryStore(objects); await store.create(owner);
  const [name, record] = [...objects.records.entries()][0];
  const malformed = JSON.parse(record.body); malformed.session.discoveredClueIds = ['registrar-check'];
  for (const body of ['not-json', '{}', JSON.stringify(malformed), 'x'.repeat(MAX_SESSION_BYTES + 1)]) {
    objects.records.set(name, { ...record, body });
    await assert.rejects(store.get(owner), StorageUnavailable);
    await assert.rejects(store.create(owner), StorageUnavailable);
    assert.equal(objects.records.get(name)?.body, body);
  }
});

test('contention retries are bounded and provider errors stay recoverable', async () => {
  const objects = new MemoryObjects(); let attempts = 0;
  objects.write = async () => { attempts++; throw new GenerationConflict(); };
  const store = new ObjectStoryStore(objects);
  await assert.rejects(store.create(owner), StorageUnavailable); assert.equal(attempts, 5);
  objects.unavailable = true; await assert.rejects(store.get(owner), StorageUnavailable);
});

test('real REST and both MCP tools await async storage and safely expose provider outages', async () => {
  const objects = new MemoryObjects(); const store = new ObjectStoryStore(objects);
  const server = createApp({ store }).listen(0, '127.0.0.1');
  await new Promise<void>(done => server.once('listening', done));
  const base = 'http://127.0.0.1:' + (server.address() as any).port;
  const first = await fetch(base + '/api/bootstrap'); const cookie = first.headers.get('set-cookie')!.split(';')[0];
  const headers = { cookie, 'Content-Type': 'application/json', origin: base };
  const { view } = await first.json();
  const client = new Client({ name: 'cluekeeper-async-local-double', version: '1' });
  const action = (command: Command, revision: number) => client.callTool({ name: 'perform_action', arguments: { command, expectedRevision: revision, expectedSessionId: view.id, requestId: randomUUID() } });
  try {
    await client.connect(new StreamableHTTPClientTransport(new URL(base + '/mcp'), { requestInit: { headers: { cookie } } }));
    const inspect = await action({ type: 'inspect', targetId: 'display-plinth' }, 0);
    assert.equal(JSON.parse((inspect.content as any)[0].text).view.ledger.length, 1);
    assert.equal((await (await fetch(base + '/api/export', { headers })).json()).view.revision, 1);
    objects.unavailable = true;
    for (const path of ['/api/bootstrap', '/api/export']) {
      const failed = await fetch(base + path, { headers }); assert.equal(failed.status, 503);
      assert.equal(failed.headers.get('Retry-After'), '5');
      const body = await failed.text(); assert.match(body, /STORAGE_UNAVAILABLE/); assert.ok(!body.includes('PRIVATE'));
    }
    for (const failed of [await client.callTool({ name: 'get_game', arguments: {} }), await action({ type: 'hint' }, 1)]) {
      assert.equal(failed.isError, true); assert.match(JSON.stringify(failed), /STORAGE_UNAVAILABLE/); assert.ok(!JSON.stringify(failed).includes('PRIVATE'));
    }
    const failedClear = await fetch(base + '/api/session', { method: 'DELETE', headers, body: JSON.stringify({ expectedSessionId: view.id }) });
    assert.equal(failedClear.status, 503); assert.equal(objects.records.size, 1);
    objects.unavailable = false;
    assert.equal((await (await fetch(base + '/api/export', { headers })).json()).view.revision, 1);
    const cleared = await fetch(base + '/api/session', { method: 'DELETE', headers, body: JSON.stringify({ expectedSessionId: view.id }) });
    assert.equal(cleared.status, 200); assert.equal(objects.records.size, 0);
  } finally { await client.close(); server.closeAllConnections(); await new Promise<void>(done => server.close(() => done())); }
});

test('storage outage during the post-model revision check returns sanitized 503 without changing story facts', async () => {
  const objects = new MemoryObjects(); const store = new ObjectStoryStore(objects);
  const server = createApp({ store, interpreter: async ({ view }) => {
    objects.unavailable = true;
    return { proposal: { actionId: view.actions[0].id, narration: view.actions[0].label }, trace: { provider: 'TEST DOUBLE', model: 'not-live', latencyMs: 0 } };
  } }).listen(0, '127.0.0.1');
  await new Promise<void>(done => server.once('listening', done));
  try {
    const base = 'http://127.0.0.1:' + (server.address() as any).port;
    const initial = await fetch(base + '/api/bootstrap'); const cookie = initial.headers.get('set-cookie')!.split(';')[0];
    const { view } = await initial.json();
    const response = await fetch(base + '/api/interpret', { method: 'POST', headers: { cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'Go somewhere', expectedRevision: view.revision, expectedSessionId: view.id }) });
    assert.equal(response.status, 503); assert.equal((await response.json()).code, 'STORAGE_UNAVAILABLE');
    objects.unavailable = false;
    assert.equal(JSON.parse([...objects.records.values()][0].body).session.revision, 0);
  } finally { server.closeAllConnections(); await new Promise<void>(done => server.close(() => done())); }
});

test('Cloud Run startup fails closed for SQLite, missing HTTPS origin and unauthorized storage scope', () => {
  const base = { ...process.env, K_SERVICE: 'cluekeeper', NODE_ENV: 'development', PORT: '3238', CLUEKEEPER_ORIGIN: 'https://example.test', CLUEKEEPER_STORE: 'gcs',
    GCP_PROJECT_ID: 'tough-melody-508008-p8', CLUEKEEPER_GCS_BUCKET: 'tough-melody-508008-p8-cluekeeper-sessions', CLUEKEEPER_MODEL_PROVIDER: 'none' };
  for (const [overrides, expected] of [
    [{ CLUEKEEPER_STORE: 'sqlite' }, /Cloud Run requires the durable GCS store/],
    [{ CLUEKEEPER_ORIGIN: '' }, /exact CLUEKEEPER_ORIGIN HTTPS origin/],
    [{ GCP_PROJECT_ID: 'unauthorized' }, /authorized project and isolated session bucket/],
    [{ CLUEKEEPER_GCS_BUCKET: 'unrelated-bucket' }, /authorized project and isolated session bucket/],
  ] as const) {
    const child = spawnSync(process.execPath, ['--import', 'tsx', 'src/server/main.ts'], { env: { ...base, ...overrides }, encoding: 'utf8', timeout: 10000 });
    assert.equal(child.status, 1); assert.match(child.stderr, expected);
  }
});

test('global admission bounds API clients even when their browser cookies rotate', async () => {
  const store = new ObjectStoryStore(new MemoryObjects());
  const server = createApp({ store }).listen(0, '127.0.0.1');
  await new Promise<void>(done => server.once('listening', done));
  try {
    const base = 'http://127.0.0.1:' + (server.address() as any).port;
    for (let i = 0; i < 600; i++) {
      const response = await fetch(base + '/api/health', { headers: { cookie: 'cluekeeper=' + createHash('sha256').update(String(i)).digest('hex') } });
      assert.equal(response.status, 200); await response.text();
    }
    const denied = await fetch(base + '/api/health');
    assert.equal(denied.status, 429); assert.equal(denied.headers.get('Retry-After'), '60');
  } finally { server.closeAllConnections(); await new Promise<void>(done => server.close(() => done())); }
});
