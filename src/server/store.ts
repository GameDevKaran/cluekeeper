import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { applyCommand, createSession, CommandSchema, DomainError, type Command, type Session } from '../domain/index.js';
import { RETENTION_MS } from './security.js';

// SQLite transaction and request-deduplication seam adapted from RoomReady
// (MIT). The session identity guard precedes retry lookup. Original-revision
// retries return the current state; uncached actions must use its revision.
export const MAX_HISTORY = 500;
export class Store {
  private db: DatabaseSync;
  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL;
      PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS sessions(owner TEXT PRIMARY KEY, body TEXT NOT NULL, expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS operations(owner TEXT NOT NULL, key TEXT NOT NULL, hash TEXT NOT NULL, PRIMARY KEY(owner,key));`);
    this.prune();
  }
  private prune() {
    const now = Date.now();
    this.db.prepare('DELETE FROM operations WHERE owner IN (SELECT owner FROM sessions WHERE expires <= ?)').run(now);
    this.db.prepare('DELETE FROM sessions WHERE expires <= ?').run(now);
  }
  get(owner: string): Session | null {
    this.prune();
    const row = this.db.prepare('SELECT body FROM sessions WHERE owner=?').get(owner) as { body: string } | undefined;
    return row ? JSON.parse(row.body) as Session : null;
  }
  create(owner: string): Session {
    const existing = this.get(owner);
    if (existing) return existing;
    const session = createSession();
    this.db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(owner, JSON.stringify(session), Date.now() + RETENTION_MS);
    return session;
  }
  command(owner: string, candidate: Command, revision: number, requestId: string, expectedSessionId: string): Session {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const state = this.get(owner);
      if (!state) throw new DomainError('NO_SESSION', 'Start a new mystery session.');
      if (state.id !== expectedSessionId) throw new DomainError('STALE_SESSION', 'This mystery session was replaced. Refresh before changing it.');
      if (!Number.isSafeInteger(revision) || revision < 0) throw new DomainError('STALE_REVISION', 'Use a valid story revision.');
      const parsed = CommandSchema.safeParse(candidate);
      if (!parsed.success || !requestId || requestId.length > 80) throw new DomainError('INVALID_COMMAND', 'Use a valid story action and request identifier.');
      const command = parsed.data;
      const hash = createHash('sha256').update(JSON.stringify({ command, revision })).digest('hex');
      const cached = this.db.prepare('SELECT hash FROM operations WHERE owner=? AND key=?').get(owner, requestId) as { hash: string } | undefined;
      if (cached) {
        if (cached.hash !== hash) throw new DomainError('KEY_REUSED', 'Request identifier already used for another action.');
        this.db.exec('COMMIT');
        return state;
      }
      const next = applyCommand(state, command, revision);
      next.history = next.history.slice(-MAX_HISTORY);
      this.db.prepare('UPDATE sessions SET body=? WHERE owner=?').run(JSON.stringify(next), owner);
      this.db.prepare('INSERT INTO operations VALUES(?,?,?)').run(owner, requestId, hash);
      this.db.prepare('DELETE FROM operations WHERE owner=? AND rowid NOT IN (SELECT rowid FROM operations WHERE owner=? ORDER BY rowid DESC LIMIT 1000)').run(owner, owner);
      this.db.exec('COMMIT');
      return next;
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  clear(owner: string) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db.prepare('DELETE FROM operations WHERE owner=?').run(owner);
      this.db.prepare('DELETE FROM sessions WHERE owner=?').run(owner);
      this.db.exec('COMMIT');
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  close() { this.db.close(); }
}
