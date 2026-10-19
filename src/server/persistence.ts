import type { Command, Session } from '../domain/index.js';

type Result<T> = T | Promise<T>;
export const MAX_HISTORY = 500;
export const MAX_RETRIES = 1000;
/** Awaited by REST/MCP; SQLite remains available for local persistent volumes. */
export interface StoryStore {
  get(owner: string): Result<Session | null>;
  create(owner: string): Result<Session>;
  command(owner: string, command: Command, revision: number, requestId: string, expectedSessionId: string): Result<Session>;
  clear(owner: string, expectedSessionId: string): Result<void>;
  close(): Result<void>;
}
export class StorageUnavailable extends Error {
  constructor() { super('Story storage is temporarily unavailable. Retry without clearing your mystery.'); }
}
