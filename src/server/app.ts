import express, { type Request, type Response, type NextFunction } from 'express';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { CommandSchema, DomainError, publicView, type Command, type Session } from '../domain/index.js';
import { StorageUnavailable, type StoryStore } from './persistence.js';
import { checkedOrigin, guard, identity } from './security.js';
import { parseProposal, type Interpreter } from './model.js';

export interface Options {
  store: StoryStore; origin?: string; production?: boolean; interpreter?: Interpreter;
  modelLabel?: string; modelLimit?: number; dist?: string;
}
const Revision = z.number().int().nonnegative();
const SessionId = z.string().uuid();
const InterpretSchema = z.object({ text: z.string().trim().min(1).max(1200), expectedRevision: Revision, expectedSessionId: SessionId }).strict();

export function createApp(options: Options) {
  const origin = checkedOrigin(options.origin, options.production);
  const modelLimit = options.modelLimit ?? 100;
  if (!Number.isSafeInteger(modelLimit) || modelLimit < 0) throw new Error('Model limit must be a nonnegative integer.');
  const app = express();
  app.disable('x-powered-by');
  app.use(guard(origin));
  // Includes cookie-rotating clients; process limits are not financial caps.
  let admissionUntil = 0, admissionCount = 0, creationDay = '', creations = 0;
  app.use((req, res, next) => {
    if (req.path.startsWith('/api/') || req.path === '/mcp') {
      const now = Date.now();
      if (now >= admissionUntil) { admissionUntil = now + 60000; admissionCount = 0; }
      if (++admissionCount > 600) {
        res.setHeader('Retry-After', '60');
        return res.status(429).json({ error: 'ClueKeeper is busy. Retry in a minute; your saved mystery remains available.' });
      }
    }
    next();
  });
  app.use(express.json({ limit: '24kb', strict: true }));
  const rates = new Map<string, { until: number; count: number }>();
  let day = '', modelCount = 0;
  const allow = (key: string, max: number, res: Response) => {
    const now = Date.now();
    if (rates.size >= 10000) for (const [id, rate] of rates) if (rate.until <= now) rates.delete(id);
    const current = rates.get(key);
    if (current && current.until > now) {
      if (++current.count <= max) return true;
    } else if (rates.size < 10000) { rates.set(key, { until: now + 60000, count: 1 }); return true; }
    res.setHeader('Retry-After', '60');
    res.status(429).json({ error: 'Request limit reached. Try again in a minute.' });
    return false;
  };
  const owner = (req: Request, res: Response) => {
    const key = identity(req, res);
    if (!key || !allow(`owner:${key}`, 120, res)) return null;
    return key;
  };
  app.get('/api/health', (_req, res) => res.json({ status: 'ok', application: 'cluekeeper' }));
  app.get('/api/bootstrap', async (req, res) => {
    if (!allow(`bootstrap:${req.socket.remoteAddress ?? 'unknown'}`, 60, res)) return;
    const key = identity(req, res, true, options.production)!;
    if (!allow(`owner:${key}`, 120, res)) return;
    let session = await options.store.get(key);
    if (!session) {
      const today = new Date().toISOString().slice(0, 10);
      if (creationDay !== today) { creationDay = today; creations = 0; }
      if (++creations > 1000) {
        res.setHeader('Retry-After', '3600');
        return res.status(429).json({ error: 'New mystery capacity has been reached today. Existing mysteries remain available.' });
      }
      session = await options.store.create(key);
    }
    res.json({ view: publicView(session), model: {
      enabled: !!options.interpreter,
      label: options.interpreter ? options.modelLabel ?? 'Bedrock action selector' : 'Authored story controls — no model inference',
    } });
  });
  app.delete('/api/session', async (req, res) => {
    const key = owner(req, res); if (!key) return;
    const input = z.object({ expectedSessionId: SessionId }).strict().parse(req.body);
    await options.store.clear(key, input.expectedSessionId);
    res.json({ cleared: true });
  });
  app.get('/api/export', async (req, res) => {
    const key = owner(req, res); if (!key) return;
    const session = await options.store.get(key);
    if (!session) return res.status(404).json({ error: 'Session expired. Open ClueKeeper again.' });
    res.setHeader('Content-Disposition', 'attachment; filename="cluekeeper-story.json"');
    res.json({ application: 'ClueKeeper', exportedAt: new Date().toISOString(), view: publicView(session) });
  });
  app.post('/api/interpret', async (req, res, next) => {
    try {
      const key = owner(req, res); if (!key) return;
      const input = InterpretSchema.parse(req.body);
      const session = await options.store.get(key);
      if (!session) return res.status(404).json({ error: 'Session expired.' });
      if (session.id !== input.expectedSessionId || session.revision !== input.expectedRevision) return res.status(409).json({ error: 'The story changed. Refresh before requesting a proposal.' });
      if (!options.interpreter) return res.status(503).json({ error: 'AI action selection is not configured. Use the authored story controls.' });
      const view = publicView(session);
      if (!view.actions.length) return res.status(409).json({ error: 'This mystery is resolved. Start a new session to play again.' });
      if (!allow(`model:${key}`, 10, res)) return;
      const today = new Date().toISOString().slice(0, 10);
      if (day !== today) { day = today; modelCount = 0; }
      if (modelCount >= modelLimit) return res.status(429).json({ error: 'Model limit reached; authored controls remain available.' });
      modelCount++;
      try {
        const result = await options.interpreter({ text: input.text, view });
        // Revalidate injected adapters too. A model cannot bypass the allowlist.
        const proposal = parseProposal(result.proposal, view);
        const current = await options.store.get(key);
        if (!current || current.id !== session.id || current.revision !== session.revision) return res.status(409).json({ error: 'The story changed while preparing the proposal. Refresh and try again.' });
        res.json({ proposal, trace: result.trace, expectedRevision: session.revision, expectedSessionId: session.id });
      } catch (error) {
        if (error instanceof StorageUnavailable) throw error;
        res.status(502).json({ error: 'The proposed action could not be verified. No story facts changed; use the authored controls.' });
      }
    } catch (error) { next(error); }
  });
  app.post('/mcp', async (req, res, next) => {
    const key = owner(req, res); if (!key) return;
    const server = new McpServer({ name: 'cluekeeper', version: '0.1.0' });
    const reply = (session: Session | null) => ({ content: [{ type: 'text' as const, text: JSON.stringify({ view: session ? publicView(session) : null }) }] });
    const failure = (error: unknown) => ({ isError: true, content: [{ type: 'text' as const, text: JSON.stringify({
      error: error instanceof DomainError || error instanceof StorageUnavailable ? error.message : 'Invalid story action.',
      code: error instanceof DomainError ? error.code : error instanceof StorageUnavailable ? 'STORAGE_UNAVAILABLE' : 'INVALID_INPUT',
    }) }] });
    const run = async (command: Command, revision: number, requestId: string, expectedSessionId: string) => {
      try { return reply(await options.store.command(key, command, revision, requestId, expectedSessionId)); }
      catch (error) { return failure(error); }
    };
    server.registerTool('get_game', { description: 'Read this browser-owned public story view and discovered clues. Hidden puzzle facts are never returned.', inputSchema: {} }, async () => {
      try { return reply(await options.store.get(key)); } catch (error) { return failure(error); }
    });
    server.registerTool('perform_action', {
      description: 'Execute one explicitly confirmed story action against the current session and revision. A model proposal does not execute automatically.',
      inputSchema: { command: CommandSchema, expectedRevision: Revision, requestId: z.string().uuid(), expectedSessionId: SessionId },
    }, async ({ command, expectedRevision, requestId, expectedSessionId }) => run(command, expectedRevision, requestId, expectedSessionId));
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on('close', () => { void server.close(); void transport.close(); });
    try { await server.connect(transport); await transport.handleRequest(req, res, req.body); }
    catch (error) { if (!res.headersSent) next(error); }
  });
  app.all('/mcp', (_req, res) => res.status(405).json({ error: 'Use Streamable HTTP POST.' }));
  const dist = options.dist ?? resolve('dist');
  if (existsSync(dist)) app.use(express.static(dist));
  app.use((_req, res) => res.status(404).json({ error: 'Route not found.' }));
  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (res.headersSent) return;
    const status = error instanceof StorageUnavailable ? 503 : error instanceof DomainError ? 409 : error instanceof z.ZodError ? 400 :
      typeof error === 'object' && error !== null && 'status' in error && [400, 413].includes(Number(error.status)) ? Number(error.status) : 500;
    if (error instanceof StorageUnavailable) res.setHeader('Retry-After', '5');
    res.status(status).json({ error: error instanceof DomainError || error instanceof StorageUnavailable ? error.message : status === 400 ? 'Invalid request.' : status === 413 ? 'Request body is too large.' : 'Request failed.',
      ...(error instanceof StorageUnavailable ? { code: 'STORAGE_UNAVAILABLE' } : {}),
    });
  });
  return app;
}
