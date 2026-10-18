import test from 'node:test';
import assert from 'node:assert/strict';
import { allowedActions, applyCommand, createSession, DomainError, publicView, type Command, type Session } from '../src/domain/index.js';
import { puzzle } from '../src/domain/puzzle.js';
import { provePuzzle } from '../src/domain/proof.js';

const completeEvidencePath: Command[] = [
  { type: 'inspect', targetId: 'display-plinth' },
  { type: 'inspect', targetId: 'condition-holder' },
  { type: 'move', roomId: 'archive' },
  { type: 'inspect', targetId: 'transfer-ledger' },
  { type: 'move', roomId: 'workshop' },
  { type: 'inspect', targetId: 'bench-register' },
  { type: 'ask', characterId: 'mateo' },
  { type: 'move', roomId: 'archive' },
  { type: 'ask', characterId: 'priya' },
];
const evidenceIds = ['transfer-tab', 'condition-card', 'signed-transfer', 'bench-location', 'conservator-account', 'registrar-check'];
const correct: Command = { type: 'solve', actorId: 'mateo', placeId: 'workshop', reasonId: 'protect-thread', evidenceIds };
function run(commands: Command[], initial = createSession('test-story')): Session {
  return commands.reduce((session, command) => applyCommand(session, command, session.revision), initial);
}
function rejectsUnchanged(session: Session, command: Command, code: string, revision = session.revision): void {
  const before = structuredClone(session);
  assert.throws(() => applyCommand(session, command, revision), (error: unknown) => error instanceof DomainError && error.code === code);
  assert.deepEqual(session, before);
}

test('Fresh story has three rooms, four adult fictional characters, an empty ledger and no solution disclosure', () => {
  const view = publicView(createSession('fresh'));
  assert.equal(view.room.id, 'gallery');
  assert.equal(view.rooms.length, 3);
  assert.equal(view.characters.length, 4);
  assert.equal(view.ledger.length, 0);
  assert.match(view.introduction, /fictional adults/);
  assert.equal('solution' in view, false);
  assert.equal('discoveredClueIds' in view, false);
  assert.deepEqual(view.actions.filter((action) => action.command.type === 'inspect').map((action) => action.id), ['inspect-display-plinth']);
  for (const clue of puzzle.clues) assert.equal(JSON.stringify(view).includes(clue.text), false);
});

test('Independent expected route discovers exactly six authored records and resolves the fixed account', () => {
  const evidence = run(completeEvidencePath);
  assert.deepEqual(evidence.discoveredClueIds, evidenceIds);
  assert.equal(evidence.phase, 'EXPLORING');
  assert.equal(evidence.revision, 9);
  const solved = applyCommand(evidence, correct, 9);
  assert.equal(solved.phase, 'SOLVED');
  assert.equal(solved.revision, 10);
  assert.deepEqual(solved.history.at(-1)!.clueIds, evidenceIds);
  assert.match(publicView(solved).narration.text, /Mateo Vale moved the Tideglass to the conservation workshop/);
  assert.deepEqual(allowedActions(solved), []);
});

test('Wrong fully evidenced hypothesis preserves facts and can be corrected without restarting', () => {
  const evidence = run(completeEvidencePath);
  const wrong = applyCommand(evidence, { ...correct, type: 'solve', actorId: 'owen' }, evidence.revision);
  assert.equal(wrong.phase, 'EXPLORING');
  assert.deepEqual(wrong.discoveredClueIds, evidence.discoveredClueIds);
  assert.equal(wrong.history.at(-1)!.kind, 'hypothesis');
  assert.doesNotMatch(wrong.history.at(-1)!.text, /Mateo|workshop|fraying/);
  assert.equal(applyCommand(wrong, correct, wrong.revision).phase, 'SOLVED');
});

test('Pause and JSON save/restore retain the exact ledger and location with append-only history', () => {
  const initial = run(completeEvidencePath.slice(0, 5));
  const before = structuredClone(initial);
  const paused = applyCommand(initial, { type: 'pause' }, initial.revision);
  assert.deepEqual(initial, before);
  assert.deepEqual(allowedActions(paused).map((action) => action.command.type), ['resume']);
  const restored = JSON.parse(JSON.stringify(paused)) as Session;
  const resumed = applyCommand(restored, { type: 'resume' }, restored.revision);
  assert.equal(resumed.phase, 'EXPLORING');
  assert.equal(resumed.roomId, 'workshop');
  assert.deepEqual(resumed.discoveredClueIds, initial.discoveredClueIds);
  assert.deepEqual(resumed.history.slice(0, initial.history.length), initial.history);
});

test('Hint tiers cap at three and point toward evidence without discovering or quoting locked clues', () => {
  const state = run([{ type: 'hint' }, { type: 'hint' }, { type: 'hint' }, { type: 'hint' }]);
  assert.equal(state.hintTier, 3);
  assert.equal(state.discoveredClueIds.length, 0);
  assert.match(state.history.at(-1)!.text, /Inspect the display plinth/);
  for (const clue of puzzle.clues) assert.equal(JSON.stringify(publicView(state)).includes(clue.text), false);
});

test('Repeated inspection preserves one ledger entry and records the repeated action honestly', () => {
  const state = run([{ type: 'inspect', targetId: 'display-plinth' }, { type: 'inspect', targetId: 'display-plinth' }]);
  assert.deepEqual(state.discoveredClueIds, ['transfer-tab']);
  assert.equal(state.history.length, 3);
  assert.equal(publicView(state).ledger.length, 1);
});

test('Public projection gives independent copies and no private prerequisites, replies or solution flags', () => {
  const state = run(completeEvidencePath.slice(0, 1));
  const before = structuredClone(state);
  const view = publicView(state);
  view.history[0]!.text = 'changed';
  view.ledger[0]!.text = 'changed';
  view.rooms[0]!.name = 'changed';
  assert.deepEqual(state, before);
  assert.equal('requires' in publicView(state).ledger[0]!, false);
  assert.equal('reply' in view.characters[0]!, false);
  assert.equal(JSON.stringify(view.solutionOptions).includes('correct'), false);
  assert.equal(publicView(createSession()).rooms[0]!.name, 'Gallery');
});

test('Adversarial 01: inspecting a target in another room is refused', () => {
  rejectsUnchanged(createSession(), { type: 'inspect', targetId: 'transfer-ledger' }, 'OUT_OF_REACH');
});
test('Adversarial 02: directly addressing a locked condition record is refused', () => {
  rejectsUnchanged(createSession(), { type: 'inspect', targetId: 'condition-holder' }, 'CLUE_LOCKED');
});
test('Adversarial 03: visiting the Archive does not bypass the transfer-reference prerequisite', () => {
  rejectsUnchanged(run([{ type: 'move', roomId: 'archive' }]), { type: 'inspect', targetId: 'transfer-ledger' }, 'CLUE_LOCKED');
});
test('Adversarial 04: the workshop location record stays locked without a signed transfer', () => {
  rejectsUnchanged(run([{ type: 'move', roomId: 'workshop' }]), { type: 'inspect', targetId: 'bench-register' }, 'CLUE_LOCKED');
});
test('Adversarial 05: asking an early witness yields only a safe lead, not the locked testimony', () => {
  const state = run([{ type: 'move', roomId: 'workshop' }, { type: 'ask', characterId: 'mateo' }]);
  assert.equal(state.discoveredClueIds.length, 0);
  assert.deepEqual(state.history.at(-1)!.clueIds, []);
  assert.equal(JSON.stringify(publicView(state)).includes(puzzle.clues[4].text), false);
});
test('Adversarial 06: knowing the true triple and hidden clue IDs cannot solve an unplayed story', () => {
  rejectsUnchanged(createSession(), correct, 'UNSUPPORTED_EVIDENCE');
});
test('Adversarial 07: an unsupported accusation with no evidence cannot resolve the story', () => {
  rejectsUnchanged(createSession(), { ...correct, type: 'solve', evidenceIds: [] }, 'INSUFFICIENT_EVIDENCE');
});
test('Adversarial 08: injected reveal fields or replacement solution data are rejected by the strict command contract', () => {
  rejectsUnchanged(createSession(), { type: 'hint', revealAll: true, solution: { actorId: 'owen' } } as unknown as Command, 'INVALID_COMMAND');
});
test('Adversarial 09: repeating a known clue cannot substitute for a missing evidence citation', () => {
  const state = run(completeEvidencePath);
  rejectsUnchanged(state, { ...correct, type: 'solve', evidenceIds: ['transfer-tab', 'transfer-tab', ...evidenceIds.slice(2)] }, 'UNSUPPORTED_EVIDENCE');
});
test('Adversarial 10: stale action cannot mutate a newer paused story', () => {
  const state = run([{ type: 'pause' }]);
  rejectsUnchanged(state, { type: 'resume' }, 'STALE_REVISION', 0);
});

test('Paused, already solved, unknown and corrupt-state requests fail without inventing evidence', () => {
  rejectsUnchanged(run([{ type: 'pause' }]), { type: 'inspect', targetId: 'display-plinth' }, 'STORY_PAUSED');
  rejectsUnchanged(run([...completeEvidencePath, correct]), { type: 'hint' }, 'STORY_SOLVED');
  rejectsUnchanged(createSession(), { type: 'move', roomId: 'secret-vault' }, 'UNKNOWN_ROOM');
  rejectsUnchanged(createSession(), { type: 'ask', characterId: 'invented-person' }, 'UNKNOWN_CHARACTER');
  const corrupted = createSession(); corrupted.discoveredClueIds = ['registrar-check'];
  assert.throws(() => publicView(corrupted), (error: unknown) => error instanceof DomainError && error.code === 'INVALID_STATE');
});

test('Every reachable finite progress state can reach the solution and every reveal obeys its prerequisites', () => {
  const proof = provePuzzle();
  assert.equal(proof.deadEndStates, 0);
  assert.equal(proof.lockedClueRevealViolations, 0);
  assert.equal(proof.unsupportedSolutionsAccepted, 0);
  assert.equal(proof.statesWithPathToSolution, proof.reachableStates);
  assert.equal(proof.publicProjectionsChecked, proof.reachableStates);
  assert.equal(proof.solvedStates, 12, 'three rooms × four hint tiers');
  assert.ok(proof.nonterminalStates > 100);
  assert.ok(proof.checkedTransitions > proof.reachableStates);
});
