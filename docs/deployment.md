# Run and deploy ClueKeeper

Use Node 24. From a clean checkout run `npm ci`, `npm run build`, then `npm start`; open `http://127.0.0.1:3230`. The authored mystery and explicit controls work without model credentials. The runtime entry point is `src/server/main.ts`; TypeScript is loaded by the pinned production `tsx` dependency. Repository verification and browser commands are maintained in the README.

Use `.env.example` as a names-only reference and copy only this app's approved values into ignored `.env.local`. Do not copy the whole portfolio master file into the repository or a browser bundle. Local defaults are `HOST=127.0.0.1`, port 3230 and `.local/cluekeeper.sqlite`. Production requires `NODE_ENV=production` and an exact HTTPS `CLUEKEEPER_ORIGIN` without a trailing slash, path, credentials or query.

## Container and HTTPS configuration

`Dockerfile` installs locked dependencies, builds the frontend, and runs as the unprivileged `node` user. SQLite lives at `/data/cluekeeper.sqlite`; the data directory belongs to that user. `compose.yaml` provides a dedicated persistent `cluekeeper_data` volume, a read-only app filesystem with temporary `/tmp`, and a Caddy HTTPS proxy. Only ports 80/443 are published; app port 3230 is private to the Compose network. The health request uses the configured public Host so production host validation remains active.

Set `CLUEKEEPER_DOMAIN` to the approved public hostname only. Compose derives `CLUEKEEPER_ORIGIN=https://<hostname>` and production configuration independently of a developer's local `.env.local`. Configure the host, DNS and budget before running `docker compose up -d --build`. Caddy needs reachable ports 80/443 and persistent certificate storage. This is one single-host deployment configuration; do not start several such proxies on the same host's ports without a deliberate shared reverse-proxy configuration. A domain placeholder or parsed Compose file is not a deployed app.

Local configuration validation, without contacting a cloud or launching containers, can use `CLUEKEEPER_DOMAIN=example.test` with `docker compose config --quiet`. The placeholder is only for validation; it cannot acquire a public certificate or stand in for a working judge URL. A full Docker build, container health check, HTTPS test and volume-restart test remain separate evidence and must be recorded only when run.

## Optional model integration

The supplied Compose configuration fixes `CLUEKEEPER_MODEL_PROVIDER=none`. It deliberately does not forward AWS credentials. To enable the optional Bedrock adapter later, configure an approved runtime identity through the standard AWS credential chain, `AWS_REGION`, `BEDROCK_MODEL_ID`, and an explicit server-side deployment override setting `CLUEKEEPER_MODEL_PROVIDER=bedrock`. Keep credentials out of image layers, Vite environment variables, logs and commits. A local `AWS_PROFILE` is useful only when that named profile is actually configured; it does not establish runtime permissions inside a container.

Bedrock interprets text only into an action already present in the current `publicView.actions`. Its narration must exactly equal that action's authored label. The player explicitly confirms a proposal before it changes state. The model does not author story facts, reveal locked clues, add evidence, or submit a solution. Hypotheses use explicit actor/place/reason/evidence fields in the UI. Unavailable or malformed proposals fail closed and leave state unchanged. The model sees typed text and public observations; browser speech transcription, when available, may depend on the browser vendor's service and must be treated as optional.

`CLUEKEEPER_MODEL_CALLS_PER_DAY=100` is an application limit, not spending approval. Confirm its actual enforcement and reset behavior in the running release before enabling inference. Configure provider/account quotas and an approved spending ceiling independently. The adapter uses bounded output, at most two SDK attempts and a 15-second request timeout. Complete the frozen evaluation described in [model-evaluation.md](model-evaluation.md) before making model-accuracy claims.

## Release, persistence and rollback

Verify an independent HTTPS URL, production cookie flags, Host/Origin rejection, a new mystery, pause/resume, export/clear, fresh-browser isolation and SQLite persistence across an app restart. Check the browser bundle and responses for unrevealed puzzle facts. Confirm model-off behavior and actual optional-model failures separately. A successful local test is not live Bedrock or deployment evidence.

Sessions have an absolute seven-day lifetime; expired records are pruned on later database access. Cookie lifetime alone is not the database retention mechanism. Clearing a session removes its state and request records; backups remain subject to the operator's explicit retention policy. Do not promise deletion from backups that have not been removed. Keep one app replica with its local SQLite volume unless a separately verified storage design replaces it.

Back up SQLite consistently, including its WAL state through SQLite-aware backup or a stopped app; copying only the main database file while it is writing can lose data. Restore using the compatible source/image revision and preserved data volume. Do not remove volumes as routine restart or rollback. Record source commit/image, approved host, public origin, persistence verification and remaining live gates in the release evidence.

GitHub verification is manual `workflow_dispatch` only. No push, pull-request or scheduled trigger is configured. Private-runner spend and workflow execution are not assumed approved; local checks remain available.
