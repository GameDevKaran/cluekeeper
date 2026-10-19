import { createHash } from 'node:crypto';
import { z } from 'zod';
import { applyCommand, createSession, CommandSchema, DomainError, publicView, type Command, type Session } from '../domain/index.js';
import { MAX_HISTORY, MAX_RETRIES, StorageUnavailable, type StoryStore } from './persistence.js';
import { RETENTION_MS } from './security.js';

export class GenerationConflict extends Error {}
export interface ObjectSnapshot { body: string; generation: string }
export interface ConditionalObjects {
  read(name: string): Promise<ObjectSnapshot | null>;
  write(name: string, body: string, generation: string): Promise<void>;
  remove(name: string, generation: string): Promise<void>;
}
export const MAX_SESSION_BYTES = 1024 * 1024;
type RecordBody = { schema: 1; expires: number; session: Session; operations: Record<string, string> };
const Hash = z.string().regex(/^[a-f0-9]{64}$/);
const RecordSchema = z.object({
  schema: z.literal(1), expires: z.number().int().nonnegative(),
  session: z.object({
    id: z.string().uuid(), revision: z.number().int().nonnegative(),
    phase: z.enum(['EXPLORING', 'PAUSED', 'SOLVED']), roomId: z.string(),
    discoveredClueIds: z.array(z.string()).max(6), hintTier: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
    history: z.array(z.object({ id: z.string(), kind: z.enum(['started', 'moved', 'inspected', 'answered', 'hint', 'hypothesis', 'paused', 'resumed', 'solved']),
      text: z.string(), clueIds: z.array(z.string()).max(6), revision: z.number().int().nonnegative() }).strict()).min(1).max(MAX_HISTORY),
  }).strict(),
  operations: z.record(Hash, Hash).refine(value => Object.keys(value).length <= MAX_RETRIES),
}).strict();

/** Adapted from HoldThat's MIT CAS adapter; ClueKeeper retains absolute expiry and compact history/retries. */
export class ObjectStoryStore implements StoryStore {
  constructor(private objects: ConditionalObjects, private now: () => number = Date.now) {}
  private name(owner: string): string {
    if (!/^[a-f0-9]{64}$/.test(owner)) throw new Error('Invalid opaque owner hash.');
    return 'sessions/' + owner + '.json';
  }
  private async retry<T>(action: () => Promise<T>): Promise<T> {
    for (let attempt = 0; attempt < 5; attempt++) {
      try { return await action(); }
      catch (error) {
        if (error instanceof DomainError) throw error;
        if (!(error instanceof GenerationConflict)) throw new StorageUnavailable();
      }
    }
    throw new StorageUnavailable();
  }
  private async current(name: string): Promise<{ value: RecordBody; generation: string } | null> {
    const snapshot = await this.objects.read(name);
    if (!snapshot) return null;
    if (Buffer.byteLength(snapshot.body) > MAX_SESSION_BYTES || !/^[1-9][0-9]*$/.test(snapshot.generation)) throw new StorageUnavailable();
    // Corrupt or incompatible records must never be silently reset or exposed.
    let value: RecordBody;
    try { value = RecordSchema.parse(JSON.parse(snapshot.body)); publicView(value.session); }
    catch { throw new StorageUnavailable(); }
    if (this.now() >= value.expires) {
      await this.objects.remove(name, snapshot.generation);
      return null;
    }
    return { value, generation: snapshot.generation };
  }
  private encode(value: RecordBody): string {
    const body = JSON.stringify(value);
    if (Buffer.byteLength(body) > MAX_SESSION_BYTES) throw new DomainError('SESSION_LIMIT', 'Export and clear this mystery before continuing.');
    return body;
  }
  async get(owner: string): Promise<Session | null> {
    return this.retry(async () => (await this.current(this.name(owner)))?.value.session ?? null);
  }
  async create(owner: string): Promise<Session> {
    const name = this.name(owner);
    return this.retry(async () => {
      const existing = await this.current(name);
      if (existing) return existing.value.session;
      const session = createSession();
      await this.objects.write(name, this.encode({ schema: 1, expires: this.now() + RETENTION_MS, session, operations: {} }), '0');
      return session;
    });
  }
  async command(owner: string, candidate: Command, revision: number, requestId: string, expectedSessionId: string): Promise<Session> {
    const name = this.name(owner);
    return this.retry(async () => {
      const record = await this.current(name);
      if (!record) throw new DomainError('NO_SESSION', 'Start a new mystery session.');
      const { value, generation } = record;
      if (value.session.id !== expectedSessionId) throw new DomainError('STALE_SESSION', 'This mystery session was replaced. Refresh before changing it.');
      if (!Number.isSafeInteger(revision) || revision < 0) throw new DomainError('STALE_REVISION', 'Use a valid story revision.');
      const parsed = CommandSchema.safeParse(candidate);
      if (!parsed.success || typeof requestId !== 'string' || !requestId || requestId.length > 80) throw new DomainError('INVALID_COMMAND', 'Use a valid story action and request identifier.');
      const command = parsed.data;
      const hash = createHash('sha256').update(JSON.stringify({ command, revision })).digest('hex');
      const key = createHash('sha256').update(requestId).digest('hex');
      const cached = value.operations[key];
      if (cached) {
        if (cached !== hash) throw new DomainError('KEY_REUSED', 'Request identifier already used for another action.');
        return value.session;
      }
      const session = applyCommand(value.session, command, revision);
      session.history = session.history.slice(-MAX_HISTORY);
      const operations = Object.fromEntries([...Object.entries(value.operations), [key, hash]].slice(-MAX_RETRIES));
      // The original expires timestamp is never extended by a command or retry.
      await this.objects.write(name, this.encode({ ...value, session, operations }), generation);
      return session;
    });
  }
  async clear(owner: string, expectedSessionId: string): Promise<void> {
    const name = this.name(owner);
    return this.retry(async () => {
      const record = await this.current(name);
      if (!record) return;
      if (record.value.session.id !== expectedSessionId) throw new DomainError('STALE_SESSION', 'This mystery session was replaced. Refresh before clearing it.');
      await this.objects.remove(name, record.generation);
    });
  }
  close(): void {}
}
