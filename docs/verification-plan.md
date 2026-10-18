# Local verification record

Verified 18 October 2026 with Node 24.8.0 and pinned dependencies. Source release commit is recorded in the portfolio checkpoint.

| Check | Observed result |
|---|---|
| TypeScript and Vite production build | Passed |
| Node tests | 37/37: 19 domain, 5 model contract, 13 server/persistence/MCP |
| Desktop/mobile Chromium | 24/24, final full run 42.1 seconds |
| Finite puzzle proof | 300 states, 1,516 transitions, all states can reach a solution |
| Locked-clue/unsupported-solution checks | Zero accepted violations in enumerated domain and ten named adversarial cases |
| Frozen corpus validation | 30 development + 30 held-out setups/expected actions valid; zero inference calls |
| Linux Docker | Build, health, actual MCP action and restart persistence passed |
| HTTPS Compose | Parsed with example.test only; nothing provisioned |
| Dependency audit | Zero vulnerabilities reported during clean install |

Browser checks exercise the complete game, incorrect and incomplete explanations, six explicit evidence citations, pause/reload/resume, hint caps, session replacement, deletion confirmation, keyboard controls, narrow viewport, hidden puzzle exclusion from the bundle, visible proposal review, changed-input invalidation and model failure. Test adapters are visibly labelled TEST DOUBLE - no live inference. A planted invented narration is rejected; the manual game continues.

Desktop/mobile screenshots were inspected. These are Chromium emulation, not physical-phone or formal accessibility certification. Optional dictation/read-aloud exists, but hardware accuracy and audibility are not verified. No live Alexa, Bedrock latency/cost/accuracy, human 8-12-minute playtime, user study, comparison superiority or public HTTPS success is claimed.

Windows agent workaround: use direct Node paths for TypeScript/Vite and 'node --import tsx --test tests/domain.test.ts tests/model.test.ts tests/server.test.ts'; this host's npm lifecycle PATH differs. Standard npm scripts pass inside Linux Docker. Node SQLite emits its documented experimental warning. Manual GitHub CI is prepared but has not been run.

The captioned local video records actual UI/MCP behavior and is held outside Git under .local/demo. It is a rehearsal, not a public submission URL. See [demo](demo.md), [domain proof limits](puzzle-proof.md) and [model evaluation](model-evaluation.md).
