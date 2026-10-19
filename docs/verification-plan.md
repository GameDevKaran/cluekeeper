# Local verification record

Updated 19 October 2026 with Node 24.8.0 and pinned dependencies. Source release commit is recorded in the portfolio checkpoint. The durable-store milestone preserves the previously completed product and browser suite; cloud deployment remains a separate parent release action.

| Check | Observed result |
|---|---|
| TypeScript and Vite production build | Passed |
| Node tests | 53/53: 19 domain, 5 model contract, 13 existing server/persistence/MCP, 14 async store/startup/admission, 2 GCS SDK transport; final run 20.0 seconds |
| Desktop/mobile Chromium | 24/24, latest full run 44.1 seconds |
| Finite puzzle proof | 300 states, 1,516 transitions, all states can reach a solution |
| Locked-clue/unsupported-solution checks | Zero accepted violations in enumerated domain and ten named adversarial cases |
| Frozen corpus validation | 30 development + 30 held-out setups/expected actions valid; zero inference calls |
| Linux Docker | Prior 18 October SQLite image build, health, actual MCP action and restart persistence passed; new GCS release image/live checks are separate |
| HTTPS Compose | Parsed with example.test only; nothing provisioned |
| Dependency audit | Zero vulnerabilities reported during clean install |

The new tests exercise concurrent idempotent bootstrap, competing mutations, identical retries, response loss after committed writes, stale deletion racing replacement, absolute expiry despite late activity, expired cleanup racing replacement, 500-event/1,000-retry compaction, malformed records, bounded contention, REST/MCP outage reporting, post-model storage failure, Cloud Run startup rejection and rotating-cookie admission. The actual Google Storage SDK sends conditional reads/writes/deletes to a labelled local HTTP double, preserving generation strings above JavaScript's safe integer range and immutable customTime metadata. No live GCS call, IAM check, public HTTPS request or inference was made by this local milestone.

Browser checks exercise the complete game, incorrect and incomplete explanations, six explicit evidence citations, pause/reload/resume, hint caps, session replacement, deletion confirmation, keyboard controls, narrow viewport, hidden puzzle exclusion from the bundle, visible proposal review, changed-input invalidation and model failure. Test adapters are visibly labelled TEST DOUBLE - no live inference. A planted invented narration is rejected; the manual game continues.

Desktop/mobile screenshots were inspected. These are Chromium emulation, not physical-phone or formal accessibility certification. Optional dictation/read-aloud exists, but hardware accuracy and audibility are not verified. No live Alexa, Bedrock latency/cost/accuracy, human 8-12-minute playtime, user study, comparison superiority or public HTTPS success is claimed.

Windows agent workaround: use direct Node paths for TypeScript/Vite and 'node --import tsx --test tests/domain.test.ts tests/model.test.ts tests/server.test.ts tests/object-store.test.ts tests/gcs.test.ts'; this host's npm lifecycle PATH differs. Standard npm scripts passed inside the prior Linux Docker release. Node SQLite emits its documented experimental warning. Manual GitHub CI is prepared but has not been run.

The captioned local video records actual UI/MCP behavior and is held outside Git under .local/demo. It is a rehearsal, not a public submission URL. See [demo](demo.md), [domain proof limits](puzzle-proof.md) and [model evaluation](model-evaluation.md).
