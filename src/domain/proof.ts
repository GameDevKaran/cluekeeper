/** Server/test-only finite-state proof. This module is never included in the browser. */
import { allowedActions, applyCommand, createSession, publicView, type Command, type Session } from './index.js';
import { puzzle } from './puzzle.js';

function key(session: Session): string {
  return [session.phase, session.roomId, session.hintTier, [...session.discoveredClueIds].sort().join(',')].join('|');
}
function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Puzzle proof failed: ${message}`);
}

/** Histories and revision numbers cannot change available progress actions. */
export function provePuzzle() {
  const first = createSession('finite-proof');
  const queue: Session[] = [first];
  const nodes = new Map<string, Session>([[key(first), first]]);
  const reverseEdges = new Map<string, Set<string>>();
  let checkedTransitions = 0;
  let checkedReveals = 0;
  let publicProjectionsChecked = 0;
  for (let index = 0; index < queue.length; index++) {
    const state = queue[index]!;
    const sourceKey = key(state);
    const view = publicView(state);
    const serialized = JSON.stringify(view);
    assert(!('solution' in view) && !('discoveredClueIds' in view), 'private solution/state leaked into the public projection');
    assert(JSON.stringify(view.ledger.map((clue) => clue.id).sort()) === JSON.stringify([...state.discoveredClueIds].sort()), 'public ledger differs from discovered evidence');
    for (const clue of puzzle.clues) if (!state.discoveredClueIds.includes(clue.id)) {
      assert(!serialized.includes(clue.text), `unrevealed clue text appeared: ${clue.id}`);
    }
    for (const event of view.history) {
      assert(event.clueIds.every((id) => state.discoveredClueIds.includes(id)), 'history references an undiscovered clue');
    }
    publicProjectionsChecked++;
    const commands: Command[] = allowedActions(state).map((action) => action.command);
    // Exhaust every hypothesis, including all incorrect hypotheses, once evidence is sufficient.
    if (state.phase === 'EXPLORING' && state.discoveredClueIds.length === puzzle.clues.length) {
      for (const actor of puzzle.characters) for (const place of puzzle.rooms) for (const reason of puzzle.reasons) {
        commands.push({ type: 'solve', actorId: actor.id, placeId: place.id, reasonId: reason.id, evidenceIds: [...state.discoveredClueIds] });
      }
    }
    for (const command of commands) {
      const before = JSON.stringify(state);
      const next = applyCommand(state, command, state.revision);
      assert(JSON.stringify(state) === before, 'transition mutated its predecessor');
      assert(next.revision === state.revision + 1, 'transition revision did not advance exactly once');
      assert(next.history.length === state.history.length + 1, 'transition did not append exactly one history event');
      assert(JSON.stringify(next.history.slice(0, -1)) === JSON.stringify(state.history), 'transition rewrote historical evidence');
      const narration = next.history.at(-1)!;
      assert(narration.clueIds.every((id) => next.discoveredClueIds.includes(id)), 'new narration references an undiscovered clue');
      for (const clue of puzzle.clues) if (!next.discoveredClueIds.includes(clue.id)) {
        assert(!narration.text.includes(clue.text), `new narration reveals a locked clue: ${clue.id}`);
      }
      for (const id of next.discoveredClueIds.filter((id) => !state.discoveredClueIds.includes(id))) {
        const clue = puzzle.clues.find((candidate) => candidate.id === id)!;
        assert(clue.requires.every((required) => state.discoveredClueIds.includes(required)), `locked clue revealed: ${id}`);
        checkedReveals++;
      }
      if (next.phase === 'SOLVED') {
        assert(command.type === 'solve' && command.actorId === 'mateo' && command.placeId === 'workshop' && command.reasonId === 'protect-thread', 'a wrong hypothesis was accepted');
        assert(state.discoveredClueIds.length === 6 && command.evidenceIds.length === 6, 'solution accepted without six cited clues');
      }
      checkedTransitions++;
      const destinationKey = key(next);
      const incoming = reverseEdges.get(destinationKey) ?? new Set<string>();
      incoming.add(sourceKey);
      reverseEdges.set(destinationKey, incoming);
      if (!nodes.has(destinationKey)) {
        nodes.set(destinationKey, next);
        queue.push(next);
      }
    }
  }
  const solved = [...nodes].filter(([, session]) => session.phase === 'SOLVED').map(([id]) => id);
  assert(solved.length > 0, 'no reachable solution');
  const canReachSolution = new Set(solved);
  const reverseQueue = [...solved];
  for (let index = 0; index < reverseQueue.length; index++) {
    for (const previous of reverseEdges.get(reverseQueue[index]!) ?? []) if (!canReachSolution.has(previous)) {
      canReachSolution.add(previous);
      reverseQueue.push(previous);
    }
  }
  const deadEnds = [...nodes.keys()].filter((id) => !canReachSolution.has(id));
  assert(deadEnds.length === 0, `${deadEnds.length} reachable states cannot reach the solution`);
  return {
    schemaVersion: 1,
    puzzleId: puzzle.id,
    method: 'Exhaustive breadth-first enumeration of phase × room × discovered-clue set × capped hint tier, followed by reverse reachability from solved states.',
    reachableStates: nodes.size,
    nonterminalStates: nodes.size - solved.length,
    solvedStates: solved.length,
    checkedTransitions,
    checkedTransitionNarrations: checkedTransitions,
    checkedClueReveals: checkedReveals,
    publicProjectionsChecked,
    statesWithPathToSolution: canReachSolution.size,
    deadEndStates: deadEnds.length,
    lockedClueRevealViolations: 0,
    unsupportedSolutionsAccepted: 0,
    limits: [
      'Finite authored puzzle only; this is not a language-model or general hallucination evaluation.',
      'Revision counters, event IDs and full history are excluded from state identity because they do not change progress affordances; every sampled transition still checks revision and immutability.',
      'Every enumerated transition also preserves the existing history and checks the new event for undiscovered evidence references and exact locked-clue text. This is an authored-fact check, not semantic equivalence testing.',
      'Hint tier is capped at three; repeated actions and incorrect evidence-backed hypotheses may form self-loops.',
      'Public projection checks exact authored hidden-clue text and evidence IDs, not every possible semantic inference from visible options.',
      'Only legal menu actions and all 36 fully evidenced hypotheses are enumerated. Invalid command shapes, missing evidence and adversarial requests are separately covered by unit cases.',
      'Network failures, provider interpretation, audio recognition, browser rendering and persistence are outside this domain proof.',
      'The reachability claim assumes a current revision, a safely representable revision counter and a readable session. Server history compaction must retain the latest event and the full discovered-clue ledger, and must not permanently block progress at a history threshold.',
    ],
  };
}
