import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { puzzle } from './puzzle.js';

export const CommandSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('move'), roomId: z.string().min(1).max(80) }).strict(),
  z.object({ type: z.literal('inspect'), targetId: z.string().min(1).max(80) }).strict(),
  z.object({ type: z.literal('ask'), characterId: z.string().min(1).max(80) }).strict(),
  z.object({ type: z.literal('hint') }).strict(),
  z.object({ type: z.literal('solve'), actorId: z.string().min(1).max(80), placeId: z.string().min(1).max(80), reasonId: z.string().min(1).max(80), evidenceIds: z.array(z.string().min(1).max(80)).max(6) }).strict(),
  z.object({ type: z.literal('pause') }).strict(),
  z.object({ type: z.literal('resume') }).strict(),
]);
export type Command = z.infer<typeof CommandSchema>;
export type Phase = 'EXPLORING' | 'PAUSED' | 'SOLVED';
export interface HistoryEvent {
  id: string;
  kind: 'started' | 'moved' | 'inspected' | 'answered' | 'hint' | 'hypothesis' | 'paused' | 'resumed' | 'solved';
  text: string;
  clueIds: string[];
  revision: number;
}
export interface Session {
  id: string;
  revision: number;
  phase: Phase;
  roomId: string;
  discoveredClueIds: string[];
  hintTier: 0 | 1 | 2 | 3;
  history: HistoryEvent[];
}
export interface AllowedAction { id: string; label: string; command: Command }
export interface PublicView {
  id: string;
  revision: number;
  phase: Phase;
  title: string;
  subtitle: string;
  introduction: string;
  room: { id: string; name: string; description: string };
  rooms: Array<{ id: string; name: string; description: string }>;
  characters: Array<{ id: string; name: string; role: string; roomId: string }>;
  ledger: Array<{ id: string; title: string; text: string; source: string }>;
  history: HistoryEvent[];
  narration: { text: string; clueIds: string[] };
  hintTier: number;
  actions: AllowedAction[];
  solutionOptions: {
    actors: Array<{ id: string; label: string }>;
    places: Array<{ id: string; label: string }>;
    reasons: Array<{ id: string; label: string }>;
  };
}
export class DomainError extends Error {
  constructor(public readonly code: string, message: string) { super(message); this.name = 'DomainError'; }
}

export function createSession(id: string = randomUUID()): Session {
  return {
    id, revision: 0, phase: 'EXPLORING', roomId: 'gallery', discoveredClueIds: [], hintTier: 0,
    history: [{ id: `${id}:0`, kind: 'started', text: puzzle.introduction, clueIds: [], revision: 0 }],
  };
}

function knownClue(id: string) { return puzzle.clues.find((clue) => clue.id === id); }
function prerequisitesMet(session: Session, clueId: string): boolean {
  return knownClue(clueId)?.requires.every((id) => session.discoveredClueIds.includes(id)) ?? false;
}
function validateState(session: Session): void {
  if (!puzzle.rooms.some((room) => room.id === session.roomId) || !Number.isSafeInteger(session.revision) || session.revision < 0 ||
      !['EXPLORING', 'PAUSED', 'SOLVED'].includes(session.phase) || !Number.isInteger(session.hintTier) || session.hintTier < 0 || session.hintTier > 3 ||
      new Set(session.discoveredClueIds).size !== session.discoveredClueIds.length ||
      session.discoveredClueIds.some((id) => !knownClue(id) || !prerequisitesMet(session, id))) {
    throw new DomainError('INVALID_STATE', 'The saved story state is invalid. Start a fresh session.');
  }
  if (session.phase === 'SOLVED' && session.discoveredClueIds.length !== puzzle.clues.length) {
    throw new DomainError('INVALID_STATE', 'A solved story must retain every supporting clue.');
  }
}
function append(session: Session, kind: HistoryEvent['kind'], text: string, clueIds: string[] = []): void {
  session.history.push({ id: `${session.id}:${session.revision}`, kind, text, clueIds: [...clueIds], revision: session.revision });
}
function reveal(session: Session, clueId: string): string[] {
  if (!prerequisitesMet(session, clueId)) throw new DomainError('CLUE_LOCKED', 'Follow the available leads before examining that evidence.');
  if (!session.discoveredClueIds.includes(clueId)) session.discoveredClueIds.push(clueId);
  return [clueId];
}

/** Visible actions contain only locations, labels and commands; no unrevealed clue facts. */
export function allowedActions(session: Session): AllowedAction[] {
  validateState(session);
  if (session.phase === 'SOLVED') return [];
  if (session.phase === 'PAUSED') return [{ id: 'resume', label: 'Resume the mystery', command: { type: 'resume' } }];
  const actions: AllowedAction[] = [];
  for (const room of puzzle.rooms) if (room.id !== session.roomId) {
    actions.push({ id: `move-${room.id}`, label: `Go to ${room.name}`, command: { type: 'move', roomId: room.id } });
  }
  for (const target of puzzle.targets) if (target.roomId === session.roomId && prerequisitesMet(session, target.clueId)) {
    actions.push({ id: `inspect-${target.id}`, label: `Inspect ${target.name}`, command: { type: 'inspect', targetId: target.id } });
  }
  for (const character of puzzle.characters) if (character.roomId === session.roomId) {
    actions.push({ id: `ask-${character.id}`, label: `Ask ${character.name}`, command: { type: 'ask', characterId: character.id } });
  }
  actions.push({ id: 'hint', label: session.hintTier ? 'Another nudge' : 'Get a gentle hint', command: { type: 'hint' } });
  actions.push({ id: 'pause', label: 'Pause and save', command: { type: 'pause' } });
  return actions;
}

function hintText(session: Session): string {
  if (session.hintTier === 1) return 'Start with what remains at the Gallery display, then follow the written references. You can revisit any room.';
  const leads: Array<[string, string, string]> = [
    ['transfer-tab', 'the Gallery display', 'Inspect the display plinth in the Gallery.'],
    ['condition-card', 'the condition record by the Gallery display', 'Return to the Gallery and inspect the condition-card holder.'],
    ['signed-transfer', 'the Archive’s movement records', 'Go to the Archive and inspect the transfer ledger.'],
    ['bench-location', 'the workshop’s bench records', 'Go to the conservation workshop and inspect its bench register.'],
    ['conservator-account', 'the conservator’s account', 'Ask Mateo in the conservation workshop about the records you found.'],
    ['registrar-check', 'the registrar’s cross-check', 'Ask Priya in the Archive to reconcile the transfer and destination records.'],
  ];
  const lead = leads.find(([id]) => !session.discoveredClueIds.includes(id));
  if (!lead) return 'All six clues are in your ledger. Compare the condition record, signed transfer, location record and witness accounts, then cite the six clues with your explanation.';
  return session.hintTier === 2 ? `One useful lead remains at ${lead[1]}. A hint points to evidence; it does not add a fact to your ledger.` : lead[2];
}

/** Only server-owned state enters this function. Invalid actions leave the original unchanged. */
export function applyCommand(session: Session, candidate: Command, expectedRevision: number): Session {
  validateState(session);
  if (!Number.isSafeInteger(expectedRevision) || session.revision !== expectedRevision) throw new DomainError('STALE_REVISION', 'The story changed. Refresh it before taking another action.');
  const parsed = CommandSchema.safeParse(candidate);
  if (!parsed.success) throw new DomainError('INVALID_COMMAND', 'Use one of the available story actions.');
  const command = parsed.data;
  if (session.phase === 'SOLVED') throw new DomainError('STORY_SOLVED', 'This mystery is already resolved. Start a new session to play again.');
  if (session.phase === 'PAUSED' && command.type !== 'resume') throw new DomainError('STORY_PAUSED', 'Resume the mystery before taking an action.');
  const next: Session = { ...session, revision: session.revision + 1, discoveredClueIds: [...session.discoveredClueIds], history: session.history.map((event) => ({ ...event, clueIds: [...event.clueIds] })) };
  switch (command.type) {
    case 'move': {
      const room = puzzle.rooms.find((item) => item.id === command.roomId);
      if (!room) throw new DomainError('UNKNOWN_ROOM', 'That room is not part of this museum.');
      next.roomId = room.id;
      append(next, 'moved', `You enter the ${room.name}. ${room.description}`);
      break;
    }
    case 'inspect': {
      const target = puzzle.targets.find((item) => item.id === command.targetId);
      if (!target) throw new DomainError('UNKNOWN_TARGET', 'That object is not available to inspect.');
      if (target.roomId !== session.roomId) throw new DomainError('OUT_OF_REACH', 'Visit the object’s room before inspecting it.');
      const clueIds = reveal(next, target.clueId);
      append(next, 'inspected', knownClue(target.clueId)!.text, clueIds);
      break;
    }
    case 'ask': {
      const character = puzzle.characters.find((item) => item.id === command.characterId);
      if (!character) throw new DomainError('UNKNOWN_CHARACTER', 'That character is not part of this story.');
      if (character.roomId !== session.roomId) throw new DomainError('OUT_OF_REACH', 'Visit the character’s room before asking a question.');
      const clueId = puzzle.witnessClues[character.id];
      if (clueId && prerequisitesMet(next, clueId)) {
        append(next, 'answered', knownClue(clueId)!.text, reveal(next, clueId));
      } else append(next, 'answered', character.reply);
      break;
    }
    case 'hint': {
      next.hintTier = Math.min(3, session.hintTier + 1) as Session['hintTier'];
      append(next, 'hint', hintText(next));
      break;
    }
    case 'solve': {
      if (!puzzle.characters.some((item) => item.id === command.actorId) || !puzzle.rooms.some((item) => item.id === command.placeId) || !puzzle.reasons.some((item) => item.id === command.reasonId)) {
        throw new DomainError('UNKNOWN_HYPOTHESIS', 'Choose an actor, place and reason from the displayed options.');
      }
      const cited = new Set(command.evidenceIds);
      if (cited.size !== command.evidenceIds.length || command.evidenceIds.some((id) => !session.discoveredClueIds.includes(id))) {
        throw new DomainError('UNSUPPORTED_EVIDENCE', 'Cite distinct clues that you have actually discovered.');
      }
      if (cited.size !== puzzle.clues.length || !puzzle.clues.every((clue) => cited.has(clue.id))) {
        throw new DomainError('INSUFFICIENT_EVIDENCE', 'Gather and cite all six clues before resolving the mystery.');
      }
      if (command.actorId === puzzle.solution.actorId && command.placeId === puzzle.solution.placeId && command.reasonId === puzzle.solution.reasonId) {
        next.phase = 'SOLVED';
        append(next, 'solved', puzzle.solvedText, [...cited]);
      } else append(next, 'hypothesis', 'That explanation does not fit the complete record. Revisit the six clues and try another account; the story facts have not changed.', [...cited]);
      break;
    }
    case 'pause': {
      next.phase = 'PAUSED';
      append(next, 'paused', 'Your place and discovered clues are saved. Resume when you are ready; no new story facts have been added.');
      break;
    }
    case 'resume': {
      if (session.phase !== 'PAUSED') throw new DomainError('NOT_PAUSED', 'The mystery is already active.');
      next.phase = 'EXPLORING';
      append(next, 'resumed', `You return to the ${puzzle.rooms.find((room) => room.id === session.roomId)!.name} with ${session.discoveredClueIds.length} recorded clue${session.discoveredClueIds.length === 1 ? '' : 's'}. Your ledger is unchanged.`);
      break;
    }
  }
  return next;
}

/** An explicit allowlist projection: never serialize the puzzle definition or raw session. */
export function publicView(session: Session): PublicView {
  validateState(session);
  const narration = session.history.at(-1)!;
  return {
    id: session.id, revision: session.revision, phase: session.phase, title: puzzle.title, subtitle: puzzle.subtitle, introduction: puzzle.introduction,
    room: { ...puzzle.rooms.find((room) => room.id === session.roomId)! },
    rooms: puzzle.rooms.map((room) => ({ ...room })),
    characters: puzzle.characters.map(({ id, name, role, roomId }) => ({ id, name, role, roomId })),
    ledger: puzzle.clues.filter((clue) => session.discoveredClueIds.includes(clue.id)).map(({ id, title, text, source }) => ({ id, title, text, source })),
    history: session.history.map((event) => ({ ...event, clueIds: [...event.clueIds] })),
    narration: { text: narration.text, clueIds: [...narration.clueIds] },
    hintTier: session.hintTier,
    actions: allowedActions(session),
    solutionOptions: {
      actors: puzzle.characters.map(({ id, name }) => ({ id, label: name })),
      places: puzzle.rooms.map(({ id, name }) => ({ id, label: name })),
      reasons: puzzle.reasons.map((reason) => ({ ...reason })),
    },
  };
}
