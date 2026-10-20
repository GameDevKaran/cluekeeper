# ClueKeeper

An original, nonviolent museum mystery: three rooms, four fictional adults and six evidence records. Follow the Tideglass transfer, keep a clue ledger, pause and return, then support an explanation with the records you discovered.

The playable web experience uses an actual MCP client/server and a deterministic story engine. It is labelled an Alexa+ experience simulation; no native Alexa connection is claimed. Optional Bedrock selects an available action for explicit review. It cannot author story facts or change the solution. Manual play works without credentials.

**Play the public application:** https://cluekeeper-kc4mxxrtbq-uc.a.run.app

Verified public release: real MCP, private GCS state surviving a new service revision, the full six-clue story, unsupported-answer rejection, export/deletion and anonymous desktop/mobile browser checks. See [live release evidence](docs/live-release.md).

## Run locally

Requires Node 24. Run 'npm ci', 'npm run build', then 'npm start'. Open http://127.0.0.1:3230. App-specific configuration is documented in .env.example. Model selection is off by default; no paid request is made by the normal game.

## Verify

Run 'npm test', 'npx playwright install chromium', 'npm run test:e2e', and 'node --import tsx scripts/validate-evaluation.ts'. The current local release passes 53 Node tests and 24 desktop/mobile Chromium tests. This includes generation-guarded persistence races, absolute expiry, retry/history compaction, storage failure and actual Google SDK requests against a labelled local HTTP double. The finite puzzle proof enumerates 300 states and 1,516 transitions; every reachable state retains a route to the solution. Thirty development and thirty held-out synthetic mapping cases are structurally valid; no live model evaluation has run.

Build a local container with 'docker build -t cluekeeper:local-20261018 .'; 'node --import tsx scripts/verify-container.ts' checks its health, actual MCP and persistence through restart. The verification script creates and stops its own temporary localhost container. It does not contact a cloud.

## Scope and evidence

[Architecture](docs/architecture.md) · [Puzzle proof](docs/puzzle-proof.md) · [Verification](docs/verification-plan.md) · [Deployment](docs/deployment.md) · [Model evaluation](docs/model-evaluation.md) · [Provenance](docs/provenance.md) · [Demo](docs/demo.md)

[Cloud Run configuration](docs/cloud-run.md) uses the existing authorized project, a private app-specific bucket and an attached runtime identity. Local SQLite remains available; Cloud Run refuses ephemeral SQLite. Public HTTPS deployment and live verification must be recorded separately from local test results.

Sessions belong to one browser and expire after seven days. Only the latest 500 history events are retained; discovered clues remain intact. Export or clear the case at any time. There are no accounts, multiplayer sessions or generated mysteries. Browser dictation/read-aloud are optional; physical speech quality, live Bedrock and human usability remain unverified. Public deployment and the full browser story flow were verified on20 October2026.

The code is [MIT](LICENSE); dependencies retain their licenses. Narrow infrastructure reuse is disclosed in provenance. The puzzle, interface and evidence rules are independently authored with AI assistance.
