import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { chromium, expect } from '@playwright/test';
import type { Command, PublicView } from '../src/domain/index.js';

const journal = JSON.parse(readFileSync('.local/cloud-run-deployment.json', 'utf8'));
assert.equal(journal.project, 'tough-melody-508008-p8'); assert.equal(journal.service, 'cluekeeper');
const base = journal.url as string;
assert.match(base, /^https:\/\/cluekeeper-[a-z0-9.-]+\.run\.app$/);
const phase = process.argv[2] ?? 'prepare'; assert.ok(['prepare', 'restart', 'public'].includes(phase));
const auth = process.env.CLUEKEEPER_VERIFY_ID_TOKEN;
const headers: Record<string, string> = auth ? { Authorization: 'Bearer ' + auth } : {};
if (phase === 'public') assert.ok(!auth, 'Public proof must not use an operator identity token.');
mkdirSync('.local/live', { recursive: true });
const savedPath = '.local/live/private-probe.json';
const checks: string[] = [];
const report: Record<string, unknown> = { at: new Date().toISOString(), phase, url: base, commit: journal.commit,
  image: journal.image, revision: journal.revision, authentication: auth ? 'operator identity (not saved)' : 'anonymous public',
  storage: 'real GCS through deployed application', model: 'disabled; no inference or native Alexa claim', checks };
const request = (path: string, options: RequestInit = {}) => fetch(base + path, { ...options, signal: AbortSignal.timeout(30000) });
try {
  const health = await request('/api/health', { headers }); assert.equal(health.status, 200);
  assert.equal((await health.json()).application, 'cluekeeper'); checks.push('HTTPS health');
  if (phase === 'prepare') {
    const initial = await request('/api/bootstrap', { headers }); assert.equal(initial.status, 200);
    const setCookie = initial.headers.get('set-cookie')!;
    for (const flag of ['Secure', 'HttpOnly', 'SameSite=Strict', 'Max-Age=604800']) assert.ok(setCookie.includes(flag));
    const cookie = setCookie.split(';')[0]; const initialData = await initial.json(); let view: PublicView = initialData.view;
    assert.equal(initialData.model.enabled, false); assert.equal(view.revision, 0); assert.equal(view.ledger.length, 0);
    checks.push('secure browser capability and truthful model-off mode');
    const sessionHeaders = { ...headers, cookie, origin: base, 'Content-Type': 'application/json' };
    const client = new Client({ name: 'cluekeeper-live-verifier', version: '1' });
    try {
      await client.connect(new StreamableHTTPClientTransport(new URL(base + '/mcp'), { requestInit: { headers: { ...headers, cookie } } }));
      assert.deepEqual((await client.listTools()).tools.map(tool => tool.name).sort(), ['get_game', 'perform_action']);
      checks.push('real deployed MCP initialize and two tools');
      const command = async (action: Command) => {
        const result = await client.callTool({ name: 'perform_action', arguments: { command: action, expectedRevision: view.revision, expectedSessionId: view.id, requestId: randomUUID() } });
        assert.ok(!result.isError); view = JSON.parse((result.content as any)[0].text).view;
      };
      await command({ type: 'inspect', targetId: 'display-plinth' });
      assert.equal(view.ledger[0].id, 'transfer-tab');
      await command({ type: 'pause' }); assert.equal(view.phase, 'PAUSED');
      const read = await client.callTool({ name: 'get_game', arguments: {} });
      assert.equal(JSON.parse((read.content as any)[0].text).view.revision, view.revision);
      checks.push('authored clue and pause persisted through actual MCP');
    } finally { await client.close(); }
    writeFileSync(savedPath, JSON.stringify({ cookie, id: view.id, revision: view.revision, deployedRevision: journal.revision }));
    const stranger = await request('/api/bootstrap', { headers }); const strangerCookie = stranger.headers.get('set-cookie')!.split(';')[0];
    const strangerView = (await stranger.json()).view; assert.notEqual(strangerView.id, view.id); assert.equal(strangerView.ledger.length, 0);
    assert.equal((await request('/api/session', { method: 'DELETE', headers: { ...sessionHeaders, cookie: strangerCookie }, body: JSON.stringify({ expectedSessionId: strangerView.id }) })).status, 200);
    checks.push('fresh-browser ownership isolation');
    const denied = await request('/api/session', { method: 'DELETE', headers: { ...sessionHeaders, origin: 'https://untrusted.invalid' }, body: JSON.stringify({ expectedSessionId: view.id }) });
    assert.equal(denied.status, 403); checks.push('cross-origin deletion rejected');
    assert.equal((await request('/api/export', { headers })).status, 401); checks.push('anonymous export denied');
    const disabled = await request('/api/interpret', { method: 'POST', headers: sessionHeaders, body: JSON.stringify({ text: 'Resume', expectedRevision: view.revision, expectedSessionId: view.id }) });
    assert.equal(disabled.status, 503); checks.push('unconfigured inference fails honestly without changing state');
  } else if (phase === 'restart') {
    const probe = JSON.parse(readFileSync(savedPath, 'utf8'));
    assert.notEqual(probe.deployedRevision, journal.revision, 'Persistence proof requires a different ready Cloud Run revision.');
    const sessionHeaders = { ...headers, cookie: probe.cookie, origin: base, 'Content-Type': 'application/json' };
    const restored = await request('/api/bootstrap', { headers: sessionHeaders }); assert.equal(restored.status, 200);
    const { view } = await restored.json();
    assert.equal(view.id, probe.id); assert.equal(view.revision, probe.revision); assert.equal(view.phase, 'PAUSED'); assert.equal(view.ledger[0].id, 'transfer-tab');
    checks.push('paused room, clue and revision survive actual Cloud Run revision replacement');
    const exported = await request('/api/export', { headers: sessionHeaders }); assert.equal(exported.status, 200);
    assert.equal((await exported.json()).view.id, probe.id); checks.push('live export');
    const cleared = await request('/api/session', { method: 'DELETE', headers: sessionHeaders, body: JSON.stringify({ expectedSessionId: probe.id }) }); assert.equal(cleared.status, 200);
    const fresh = (await (await request('/api/bootstrap', { headers: sessionHeaders })).json()).view;
    assert.notEqual(fresh.id, probe.id); assert.equal(fresh.revision, 0); assert.equal(fresh.ledger.length, 0);
    const staleDelete = await request('/api/session', { method: 'DELETE', headers: sessionHeaders, body: JSON.stringify({ expectedSessionId: probe.id }) }); assert.equal(staleDelete.status, 409);
    const retryFresh = (await (await request('/api/bootstrap', { headers: sessionHeaders })).json()).view; assert.equal(retryFresh.id, fresh.id);
    assert.equal((await request('/api/session', { method: 'DELETE', headers: sessionHeaders, body: JSON.stringify({ expectedSessionId: fresh.id }) })).status, 200);
    checks.push('live deletion and stale-session rejection protect replacement');
  } else {
    const browser = await chromium.launch();
    const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, recordVideo: { dir: '.local/live/video', size: { width: 1440, height: 1100 } } });
    try {
      const page = await context.newPage(); page.setDefaultTimeout(20000);
      let mcpActions = 0; let discovery = false; const pageErrors: string[] = [];
      page.on('pageerror', error => pageErrors.push(error.message));
      page.on('request', req => { if (req.url() === base + '/mcp' && req.method() === 'POST') { const body = req.postDataJSON(); if (body?.method === 'tools/call') mcpActions++; if (body?.method === 'tools/list') discovery = true; } });
      await page.goto(base); await expect(page.getByRole('heading', { name: 'The clue ledger' })).toBeVisible();
      await page.screenshot({ path: '.local/live/cluekeeper-desktop.png', fullPage: true });
      await page.getByRole('button', { name: 'Inspect Display plinth' }).click(); await expect(page.locator('.clue-count')).toHaveText('1/6');
      await page.getByRole('button', { name: 'Pause & save', exact: true }).click(); await expect(page.locator('.status')).toHaveText('Saved & paused');
      await page.reload(); await expect(page.locator('.status')).toHaveText('Saved & paused'); await expect(page.locator('.clue-count')).toHaveText('1/6');
      await page.screenshot({ path: '.local/live/cluekeeper-paused.png', fullPage: true });
      await page.getByRole('button', { name: 'Resume the mystery' }).click(); await expect(page.locator('.status')).toHaveText('Investigation in progress');
      await page.getByLabel('Who moved it?').selectOption('mateo'); await page.getByLabel('Where did it go?').selectOption('workshop'); await page.getByLabel('Why was it moved?').selectOption('protect-thread');
      await page.getByRole('button', { name: 'Test my explanation' }).click(); await expect(page.getByRole('alert')).toContainText('Gather and cite all six');
      checks.push('anonymous real-browser MCP, pause/reload/resume and unsupported-solution rejection');
      await page.getByRole('button', { name: 'Inspect Condition-card holder' }).click();
      await page.locator('[data-room="archive"]').click(); await page.getByRole('button', { name: 'Inspect Transfer ledger' }).click();
      await page.locator('[data-room="workshop"]').click(); await page.getByRole('button', { name: 'Inspect Bench register' }).click(); await page.getByRole('button', { name: 'Ask Mateo Vale' }).click();
      await page.locator('[data-room="archive"]').click(); await page.getByRole('button', { name: 'Ask Priya Das' }).click(); await expect(page.locator('.clue-count')).toHaveText('6/6');
      for (const cite of await page.locator('[data-cite]').all()) await cite.check();
      await page.getByRole('button', { name: 'Test my explanation' }).click(); await expect(page.locator('.status')).toHaveText('Case resolved');
      const exported = await page.request.get(base + '/api/export'); assert.equal(exported.status(), 200);
      const exportedView = (await exported.json()).view; assert.equal(exportedView.phase, 'SOLVED'); assert.equal(exportedView.ledger.length, 6);
      await page.reload(); await expect(page.locator('.status')).toHaveText('Case resolved');
      assert.ok(discovery && mcpActions >= 10); assert.deepEqual(pageErrors, []);
      checks.push('all six authored clues, explicit citations, resolved story and reload/export verified');
      await page.screenshot({ path: '.local/live/cluekeeper-resolved.png', fullPage: true });
      await page.setViewportSize({ width: 390, height: 844 }); assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.screenshot({ path: '.local/live/cluekeeper-mobile.png', fullPage: true }); checks.push('desktop/mobile screenshots and actual public browser recording');
      await page.getByRole('button', { name: 'Start a fresh case' }).click(); await page.getByRole('button', { name: 'Delete & start fresh' }).click(); await expect(page.locator('.clue-count')).toHaveText('0/6');
      const after = (await (await page.request.get(base + '/api/bootstrap')).json()).view; assert.notEqual(after.id, exportedView.id); assert.equal(after.revision, 0);
      assert.equal((await page.request.delete(base + '/api/session', { data: { expectedSessionId: after.id } })).status(), 200);
      checks.push('browser-confirmed deletion and fresh-case cleanup');
    } finally { await context.close(); await browser.close(); }
  }
  report.passed = true;
} catch (error) { report.passed = false; report.error = error instanceof Error ? error.message.replace(/Bearer\s+\S+/g, 'Bearer [redacted]') : 'Verification failed'; throw error; }
finally { writeFileSync('.local/live/' + phase + '-verification.json', JSON.stringify(report, null, 2)); console.log(JSON.stringify({ phase, passed: report.passed, checks })); }
