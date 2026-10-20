# Public release — 20 October 2026

Application: https://cluekeeper-kc4mxxrtbq-uc.a.run.app
Source: https://github.com/GameDevKaran/cluekeeper
Deployed commit: c9fbd66c7f61d8ef2d0c1c590390d7fad59839b8
Revision: cluekeeper-00003-m2f
Image: us-central1-docker.pkg.dev/tough-melody-508008-p8/cluekeeper-images/cluekeeper@sha256:0524e5d0a7eb3811f1d98c39a6394d5d4fd9e4e10508f999e8db38fc14985e17

Actual deployed checks passed: HTTPS; secure browser cookies; MCP initialize and get_game/perform_action tools; authored clue and pause; owner isolation; hostile-origin rejection; denied anonymous export; honest model-disabled error. Paused room/clue/revision state survived an actual Cloud Run revision replacement. Export, deletion and stale-session rejection protected a replacement case.

The anonymous browser completed all six authored records, rejected a solution without enough cited evidence, explicitly cited the records, solved the case, reloaded/exported it, then cleared it. Desktop/mobile screenshots were captured and the resolved screenshot visually inspected. Raw public browser video is verification footage, not a narrated uploaded submission video.

Before release, 53 Node and24 browser tests passed. Failure and provider-race tests use labelled doubles; the live checks above use real GCS/MCP. Finite puzzle evidence covers300 states and1516 transitions only; no broader model or human accuracy claim is made.

Model inference is disabled. No native Alexa device, live Bedrock or physical speech-quality claim. Optional browser speech has manual controls. User supplies final media and manual Devpost submission. No Devpost access occurred.

Reproduction: README and scripts/verify-live.ts. Operator reports/screenshots are in ignored .local/live; never publish private-probe.json or browser cookies. Preserve the existing real evidence rather than repeating tests unnecessarily.
