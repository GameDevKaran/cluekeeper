import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import type { AddressInfo } from 'node:net';
import { request as httpRequest } from 'node:http';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { Store, MAX_HISTORY } from '../src/server/store.js';
import { createApp, type Options } from '../src/server/app.js';
import { RETENTION_MS } from '../src/server/security.js';
import type { Command, PublicView } from '../src/domain/index.js';

async function fixture(extra: Partial<Options> = {}) {
  const store = new Store(':memory:');
  const server = createApp({ store, ...extra }).listen(0, '127.0.0.1');
  await new Promise<void>(done => server.once('listening', done));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const initial = await fetch(`${base}/api/bootstrap`);
  const setCookie = initial.headers.get('set-cookie')!;
  const cookie = setCookie.split(';')[0];
  const bootstrap = await initial.json();
  const view: PublicView = bootstrap.view;
  const owner = createHash('sha256').update(cookie.slice(11)).digest('hex');
  const request = async (path: string, body?: unknown, method = body === undefined ? 'GET' : 'POST', headers: Record<string, string> = {}) => {
    const response = await fetch(base + path, { method, headers: { cookie, origin: base, 'Content-Type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, body: await response.json(), headers: response.headers };
  };
  const client = new Client({ name: 'cluekeeper-test', version: '1' });
  await client.connect(new StreamableHTTPClientTransport(new URL(base + '/mcp'), { requestInit: { headers: { cookie } } }));
  const action = (command: Command, revision = 0, requestId = randomUUID(), sessionId = view.id) => client.callTool({ name: 'perform_action', arguments: { command, expectedRevision: revision, requestId, expectedSessionId: sessionId } });
  return { store, server, base, cookie, setCookie, owner, view, bootstrap, request, client, action,
    close: async () => { await client.close(); server.closeAllConnections(); await new Promise<void>(done => server.close(() => done())); store.close(); },
  };
}
function result(call: any): { view: PublicView | null } { return JSON.parse(call.content[0].text); }

test('real MCP discovery, authored action, public read and export', async () => {
  const f = await fixture();
  try {
    assert.deepEqual((await f.client.listTools()).tools.map(tool => tool.name).sort(), ['get_game', 'perform_action']);
    const inspect = f.view.actions.find(action => action.command.type === 'inspect')!;
    assert.ok(inspect);
    const response = await f.action(inspect.command);
    assert.ok(!response.isError);
    const view = result(response).view!;
    assert.equal(view.revision, 1);
    assert.equal(view.ledger.length, 1);
    assert.equal(result(await f.client.callTool({ name: 'get_game', arguments: {} })).view!.revision, 1);
    const exported = await f.request('/api/export');
    assert.equal(exported.body.view.ledger.length, 1);
    assert.equal(exported.body.state, undefined);
    assert.equal(exported.body.view.solution, undefined);
    assert.match(exported.headers.get('content-disposition')!, /cluekeeper-story/);
  } finally { await f.close(); }
});

test('browser ownership, exact cookie and seven-day cookie duration', async () => {
  const f = await fixture();
  try {
    assert.match(f.setCookie, /^cluekeeper=[a-f0-9]{64};/);
    assert.match(f.setCookie, /HttpOnly; SameSite=Strict; Max-Age=604800/);
    await f.action({ type: 'hint' });
    const other = await fetch(f.base + '/api/bootstrap');
    const otherView = (await other.json()).view;
    assert.notEqual(otherView.id, f.view.id);
    assert.equal(otherView.revision, 0);
    assert.equal((await fetch(f.base + '/api/export')).status, 401);
    assert.equal((await f.request('/api/export', undefined, 'GET', { cookie: 'roomready=' + f.cookie.slice(11) })).status, 401);
    assert.equal((await f.request('/api/export', undefined, 'GET', { cookie: f.cookie + '; ' + f.cookie })).status, 401);
  } finally { await f.close(); }
});

test('host, origin and cross-site guards cover health and mutation', async () => {
  const f = await fixture();
  try {
    assert.equal((await f.request('/mcp', {}, 'POST', { origin: 'https://outside.invalid' })).status, 403);
    const forgedHostStatus = await new Promise<number>(done => {
      const request = httpRequest(f.base + '/api/health', { headers: { host: 'outside.invalid' } }, response => { response.resume(); done(response.statusCode!); });
      request.end();
    });
    assert.equal(forgedHostStatus, 403);
    assert.equal((await f.request('/api/bootstrap', undefined, 'GET', { 'sec-fetch-site': 'cross-site' })).status, 403);
    const response = await f.request('/api/health');
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-security-policy')!, /frame-ancestors 'none'/);
    assert.equal(response.headers.get('cache-control'), 'no-store');
  } finally { await f.close(); }
});

test('production startup fails closed without an exact HTTPS origin', () => {
  const store = new Store(':memory:');
  try {
    assert.throws(() => createApp({ store, production: true }));
    assert.throws(() => createApp({ store, production: true, origin: 'http://example.test' }));
    assert.throws(() => createApp({ store, production: true, origin: 'https://example.test/path' }));
    assert.throws(() => createApp({ store, modelLimit: Number.NaN }));
    assert.doesNotThrow(() => createApp({ store, production: true, origin: 'https://example.test' }));
  } finally { store.close(); }
});

test('same-command original-revision retries preserve current state; conflicting keys fail', () => {
  const store = new Store(':memory:');
  try {
    const id = store.create('one').id;
    store.command('one', { type: 'hint' }, 0, 'first', id);
    store.command('one', { type: 'pause' }, 1, 'second', id);
    const retry = store.command('one', { type: 'hint' }, 0, 'first', id);
    assert.equal(retry.revision, 2);
    assert.equal(retry.phase, 'PAUSED');
    assert.throws(() => store.command('one', { type: 'hint' }, 2, 'first', id), (error: any) => error.code === 'KEY_REUSED');
    assert.throws(() => store.command('one', { type: 'resume' }, 0, 'third', id), (error: any) => error.code === 'STALE_REVISION');
    assert.equal(store.get('one')!.revision, 2);
  } finally { store.close(); }
});

test('replacement session at revision zero rejects old mutation, deletion and model calls', async () => {
  let calls = 0;
  const f = await fixture({ interpreter: async () => { calls++; throw new Error('Must not run'); } });
  try {
    assert.equal((await f.request('/api/session', { expectedSessionId: f.view.id }, 'DELETE')).status, 200);
    const replacement = (await f.request('/api/bootstrap')).body.view;
    assert.notEqual(replacement.id, f.view.id);
    const stale = await f.action({ type: 'hint' });
    assert.ok(stale.isError);
    assert.match((stale.content as any)[0].text, /STALE_SESSION/);
    assert.equal((await f.request('/api/session', { expectedSessionId: f.view.id }, 'DELETE')).status, 409);
    assert.equal((await f.request('/api/interpret', { text: 'hint', expectedRevision: 0, expectedSessionId: f.view.id })).status, 409);
    assert.equal(calls, 0);
    assert.equal((await f.request('/api/bootstrap')).body.view.id, replacement.id);
  } finally { await f.close(); }
});

test('session identity is checked before retry cache', () => {
  const store = new Store(':memory:');
  try {
    const old = store.create('one');
    store.command('one', { type: 'hint' }, 0, 'request', old.id);
    assert.throws(() => store.command('one', { type: 'hint' }, 0, 'request', randomUUID()), (error: any) => error.code === 'STALE_SESSION');
    store.clear('one');
    store.create('one');
    assert.throws(() => store.command('one', { type: 'hint' }, 0, 'request', old.id), (error: any) => error.code === 'STALE_SESSION');
  } finally { store.close(); }
});

test('SQLite persists, fixed seven-day expiry prunes, deletion removes state', () => {
  const directory = mkdtempSync(join(tmpdir(), 'cluekeeper-test-'));
  try {
    const path = join(directory, 'story.sqlite');
    let store = new Store(path);
    const started = Date.now();
    const id = store.create('one').id;
    store.command('one', { type: 'hint' }, 0, 'one', id);
    store.close();
    const db = new DatabaseSync(path);
    const expiry = (db.prepare('SELECT expires FROM sessions WHERE owner=?').get('one') as { expires: number }).expires;
    assert.ok(expiry >= started + RETENTION_MS && expiry <= Date.now() + RETENTION_MS);
    db.close();
    store = new Store(path);
    assert.equal(store.get('one')!.revision, 1);
    store.close();
    const expiryDb = new DatabaseSync(path);
    expiryDb.prepare('UPDATE sessions SET expires=0 WHERE owner=?').run('one');
    expiryDb.close();
    store = new Store(path);
    assert.equal(store.get('one'), null);
    assert.notEqual(store.create('one').id, id);
    store.clear('one');
    assert.equal(store.get('one'), null);
    store.close();
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('history compaction preserves the ability to continue playing', () => {
  const store = new Store(':memory:');
  try {
    const id = store.create('one').id;
    for (let i = 0; i < MAX_HISTORY + 2; i++) store.command('one', { type: 'hint' }, i, `hint-${i}`, id);
    const session = store.get('one')!;
    assert.equal(session.history.length, MAX_HISTORY);
    assert.equal(session.discoveredClueIds.length, 0);
    const paused = store.command('one', { type: 'pause' }, session.revision, 'pause', id);
    assert.equal(paused.phase, 'PAUSED');
    assert.equal(paused.history.length, MAX_HISTORY);
  } finally { store.close(); }
});

test('model proposal is read-only and must be explicitly executed over MCP', async () => {
  const f = await fixture({ interpreter: async ({ view }) => ({ proposal: { actionId: view.actions[0].id, narration: view.actions[0].label }, trace: { provider: 'TEST DOUBLE', model: 'injected', latencyMs: 1 } }) });
  try {
    const interpreted = await f.request('/api/interpret', { text: 'Go somewhere', expectedRevision: 0, expectedSessionId: f.view.id });
    assert.equal(interpreted.status, 200);
    assert.equal(interpreted.body.expectedSessionId, f.view.id);
    assert.equal(interpreted.body.expectedRevision, 0);
    assert.equal(f.store.get(f.owner)!.revision, 0);
    const chosen = f.view.actions.find(action => action.id === interpreted.body.proposal.actionId)!;
    assert.equal(result(await f.action(chosen.command)).view!.revision, 1);
    assert.equal((await f.request('/api/interpret', { text: 'Next', expectedRevision: 0, expectedSessionId: f.view.id })).status, 409);
  } finally { await f.close(); }
});

test('disabled model and failed contract are truthful and leave state unchanged', async () => {
  const disabled = await fixture();
  try {
    assert.equal(disabled.bootstrap.model.enabled, false);
    assert.equal((await disabled.request('/api/interpret', { text: 'Help', expectedRevision: 0, expectedSessionId: disabled.view.id })).status, 503);
  } finally { await disabled.close(); }
  const f = await fixture({ modelLimit: 1, interpreter: async () => ({ proposal: { actionId: 'invented', narration: 'The answer is invented.' }, trace: { provider: 'TEST DOUBLE', model: 'invalid', latencyMs: 1 } }) });
  try {
    const input = { text: 'Help', expectedRevision: 0, expectedSessionId: f.view.id };
    assert.equal((await f.request('/api/interpret', input)).status, 502);
    assert.equal((await f.request('/api/interpret', input)).status, 429);
    assert.equal(f.store.get(f.owner)!.revision, 0);
  } finally { await f.close(); }
});

test('model response becomes stale while a concurrent action changes the story', async () => {
  let resolveModel!: () => void;
  let started!: () => void;
  const began = new Promise<void>(done => { started = done; });
  const release = new Promise<void>(done => { resolveModel = done; });
  const f = await fixture({ interpreter: async ({ view }) => { started(); await release; return { proposal: { actionId: view.actions[0].id, narration: view.actions[0].label }, trace: { provider: 'TEST DOUBLE', model: 'delayed', latencyMs: 1 } }; } });
  try {
    const request = f.request('/api/interpret', { text: 'Go', expectedRevision: 0, expectedSessionId: f.view.id });
    await began;
    await f.action({ type: 'hint' });
    resolveModel();
    assert.equal((await request).status, 409);
    assert.equal(f.store.get(f.owner)!.revision, 1);
  } finally { resolveModel(); await f.close(); }
});

test('bounded bodies, invalid JSON, unknown action fields and locked actions are rejected', async () => {
  const f = await fixture();
  try {
    assert.equal((await f.request('/api/interpret', { text: 'x'.repeat(30000), expectedRevision: 0, expectedSessionId: f.view.id })).status, 413);
    const malformed = await fetch(f.base + '/api/interpret', { method: 'POST', headers: { cookie: f.cookie, 'Content-Type': 'application/json' }, body: '{' });
    assert.equal(malformed.status, 400);
    const extra = await f.client.callTool({ name: 'perform_action', arguments: { command: { type: 'hint', solution: 'invented' }, expectedRevision: 0, expectedSessionId: f.view.id, requestId: randomUUID() } });
    assert.ok(extra.isError);
    const unavailable = await f.action({ type: 'inspect', targetId: 'not-a-real-target' });
    assert.ok(unavailable.isError);
    assert.equal(f.store.get(f.owner)!.revision, 0);
    assert.equal((await f.request('/mcp', undefined, 'GET')).status, 405);
  } finally { await f.close(); }
});
