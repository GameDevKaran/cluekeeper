# Puzzle reachability and disclosure checks

ClueKeeper’s authored puzzle, **The Tideglass Transfer**, has a solution path from every reachable nonterminal **domain progress state**. This claim is about the finite puzzle graph under valid, current-revision actions. It is not a claim that every conversation, network session or model response will successfully finish the game.

## Recorded result

The current result is saved in [domain-proof.json](../evaluation/domain-proof.json). The proof implementation is [proof.ts](../src/domain/proof.ts); the 19 domain cases, including ten named adversarial cases, are in [domain.test.ts](../tests/domain.test.ts).

| Check | Result |
| --- | ---: |
| Reachable progress states | 300 |
| Nonterminal progress states | 288 |
| Solved progress states | 12 |
| Checked action transitions | 1,516 |
| Checked newly revealed clue edges | 64 |
| Checked public state projections | 300 |
| Checked appended narration events | 1,516 |
| States with a path to a solved state | 300 |
| Dead ends | 0 |
| Locked-clue reveal violations | 0 |
| Unsupported solutions accepted in enumerated hypotheses | 0 |

The 12 solved states represent the three possible current rooms multiplied by four hint tiers. These are twelve progress configurations of one solution, not twelve alternative answers. The 64 reveal edges include the same six authored clues reached from different legal progress configurations; they are not 64 separate clues.

## How the proof works

Breadth-first search starts from a new session and identifies each state by:

```
(phase, current room, sorted discovered-clue IDs, hint tier)
```

The phases are `EXPLORING`, `PAUSED` and `SOLVED`. Hint tiers are capped at three. For each discovered state, the checker executes every action returned by `allowedActions`. Once all six clues are present, it also executes all 36 actor/place/reason combinations with the complete evidence set: four actors × three places × three reasons. Wrong hypotheses retain the same progress state, while the fixed correct account reaches `SOLVED`.

Each accepted transition must leave its input unchanged, advance its revision exactly once, append one history event and preserve all previous events. Any newly discovered clue must have all its prerequisites in the **predecessor** state. The new event must reference only discovered clue IDs and must not contain the exact authored text of any still-locked clue.

The public projection is checked for every enumerated state. Its ledger must match the discovered-clue set; it must omit the private solution and raw internal clue-ID field; its history cannot reference undiscovered evidence; and it cannot contain exact text from locked clues.

The checker then traverses the graph backwards from all solved states. All 300 discovered states are reached by this reverse traversal. Consequently, each of the 288 nonterminal progress states has a sequence of legal actions leading to a solution. Solvability is existential: the player can still pause indefinitely, revisit rooms or repeat an incorrect hypothesis.

## Why the state abstraction is valid

The transition implementation selects progress outcomes from the phase, room, discovered-clue membership and hint tier. It does not use previous prose, event count, session ID, evidence-discovery order or the magnitude of the revision to decide which clue is available or which account is correct.

Revision is a concurrency guard: the request must match the stored revision. Under that precondition, incrementing the counter does not change the available puzzle route. Evidence order only affects presentation. Repeated inspection, repeated hints at the maximum tier and incorrect fully evidenced hypotheses may append history but do not create new progress configurations. Moving to the current room is another accepted self-loop; it is absent from the move menu and introduces no additional progress state. Invalid actions are rejected without changing state and therefore introduce no new reachable states.

The omitted history is still relevant to presentation. The checker verifies that every enumerated transition preserves previous history and appends evidence-safe narration. Together with monotonic clue discovery, this supports the history disclosure invariant without treating every repeated transcript as a distinct puzzle state. This does **not** prove arbitrary model-generated prose safe: model narration requires its separate validation boundary and tests.

The abstraction assumes a valid session and a safely representable revision counter. JavaScript counter exhaustion, corrupted saved state, stale requests, unavailable storage and network failures are outside the finite graph claim. A stale client must refresh before taking its next action.

## Server history compaction requirements

History compaction can preserve the domain reachability result if it keeps the latest event, the complete `discoveredClueIds` ledger, the current phase and room, and the current revision and hint tier. The ledger is the source of puzzle progress; historical prose is not used to reconstruct prerequisites. Keeping the latest event is necessary because `publicView` reads it as the current narration.

Do not reset or reuse revision numbers during compaction. Do not make an event-count limit a permanent refusal of all future commands; that would introduce a storage-level dead end not present in this graph. Compacted history also needs accurate product wording: a retained recent history is not a complete lifetime transcript. Storage compaction and recovery require integration checks separately from this domain proof.

## Adversarial cases already exercised

The ten named adversarial cases attempt to inspect evidence from the wrong room; open the condition card, transfer ledger or workshop record before their prerequisites; obtain early witness testimony; solve with the correct triple and undiscovered clue IDs; accuse without evidence; inject replacement solution/reveal fields; substitute repeated evidence citations; and apply a stale action after a pause. Refused actions preserve their input state. The early witness question is permitted but returns an authored lead with no discovered evidence.

Additional domain cases cover ordinary completion, wrong supported hypotheses followed by correction, JSON save/restore and pause/resume, repeated inspection, bounded hints, public-view copying, terminal-state refusal and corrupt progress data. These are direct engine inputs, not 30 measured natural-language paraphrases. They do not satisfy the separate live-model, held-out utterance, browser, MCP, narration-injection or provider-failure evaluation requirements.

## Authorship and scope

The Tideglass story, four adult fictional characters, six clue records, reveal prerequisites and solution were newly authored for ClueKeeper during AI-assisted application development. They were not taken from an existing mystery franchise or a real investigation. This is an account of the work performed here, not a claim of independent human authorship or review.

The manually specified expected route and adversarial cases supplement an executable graph check that calls the same domain engine used by the application. This is not an independently implemented formal verification system. The disclosure checks inspect clue IDs and exact authored strings; they do not establish that a player cannot infer an answer from visible options or that all semantically equivalent leaks would be detected. The authored play duration, language-model accuracy and general hallucination resistance remain separate, unmeasured questions until their own evaluations are run.

## Reproduce

With the repository dependencies installed, run:

```sh
node --import tsx --test tests/domain.test.ts
```

That command runs the finite proof alongside the domain cases and fails if an asserted invariant fails. The recorded JSON is a saved result, not automatically rewritten by the tests. `provePuzzle()` in `src/domain/proof.ts` returns the current machine-readable counts for deliberate refresh of the record after puzzle changes.
