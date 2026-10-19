import { Store } from './store.js';
import { createApp } from './app.js';
import { createBedrockInterpreter } from './model.js';
import { checkedOrigin } from './security.js';
import { ObjectStoryStore } from './object-store.js';
import { GcsObjects } from './gcs.js';

const cloudRun = Boolean(process.env.K_SERVICE);
const production = cloudRun || process.env.NODE_ENV === 'production';
const origin = checkedOrigin(process.env.CLUEKEEPER_ORIGIN, production);
const provider = process.env.CLUEKEEPER_MODEL_PROVIDER ?? 'none';
if (!['none', 'off', 'bedrock'].includes(provider)) throw new Error('CLUEKEEPER_MODEL_PROVIDER must be none or bedrock.');
const enabled = provider === 'bedrock';
const region = process.env.CLUEKEEPER_AWS_REGION ?? process.env.AWS_REGION;
const model = process.env.CLUEKEEPER_BEDROCK_MODEL_ID ?? process.env.BEDROCK_MODEL_ID;
if (enabled && (!region || !model)) throw new Error('Bedrock mode needs an approved region/model and the AWS credential chain.');
const modelLimit = Number(process.env.CLUEKEEPER_MODEL_CALLS_PER_DAY ?? 100);
if (!Number.isSafeInteger(modelLimit) || modelLimit < 0) throw new Error('CLUEKEEPER_MODEL_CALLS_PER_DAY must be a nonnegative integer.');
const port = Number(cloudRun ? process.env.PORT : process.env.CLUEKEEPER_PORT ?? process.env.PORT ?? 3230);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid CLUEKEEPER_PORT.');
const mode = process.env.CLUEKEEPER_STORE ?? 'sqlite';
if (!['sqlite', 'gcs'].includes(mode)) throw new Error('CLUEKEEPER_STORE must be sqlite or gcs.');
if (cloudRun && mode !== 'gcs') throw new Error('Cloud Run requires the durable GCS store; SQLite is only for a persistent local volume.');
const store = mode === 'gcs'
  ? new ObjectStoryStore(new GcsObjects(process.env.GCP_PROJECT_ID ?? '', process.env.CLUEKEEPER_GCS_BUCKET ?? ''))
  : new Store(process.env.CLUEKEEPER_DATABASE_PATH ?? '.local/cluekeeper.sqlite');
const app = createApp({ store, production, origin, modelLimit,
  interpreter: enabled ? createBedrockInterpreter(region!, model!) : undefined,
  modelLabel: enabled ? `Bedrock · ${model}` : undefined,
});
const server = app.listen(port, cloudRun ? '0.0.0.0' : process.env.CLUEKEEPER_HOST ?? process.env.HOST ?? '127.0.0.1', () => {
  console.log(`ClueKeeper listening on port ${port}; model ${enabled ? 'configured, proposals require confirmation' : 'disabled'}.`);
});
const stop = () => {
  server.close(async () => { await store.close(); process.exit(0); });
  server.closeIdleConnections();
  setTimeout(() => server.closeAllConnections(), 5000).unref();
};
process.once('SIGTERM', stop);
process.once('SIGINT', stop);
