import { Store } from './store.js';
import { createApp } from './app.js';
import { createBedrockInterpreter } from './model.js';
import { checkedOrigin } from './security.js';

const production = process.env.NODE_ENV === 'production';
const origin = checkedOrigin(process.env.CLUEKEEPER_ORIGIN, production);
const provider = process.env.CLUEKEEPER_MODEL_PROVIDER ?? 'none';
if (!['none', 'off', 'bedrock'].includes(provider)) throw new Error('CLUEKEEPER_MODEL_PROVIDER must be none or bedrock.');
const enabled = provider === 'bedrock';
const region = process.env.CLUEKEEPER_AWS_REGION ?? process.env.AWS_REGION;
const model = process.env.CLUEKEEPER_BEDROCK_MODEL_ID ?? process.env.BEDROCK_MODEL_ID;
if (enabled && (!region || !model)) throw new Error('Bedrock mode needs an approved region/model and the AWS credential chain.');
const modelLimit = Number(process.env.CLUEKEEPER_MODEL_CALLS_PER_DAY ?? 100);
if (!Number.isSafeInteger(modelLimit) || modelLimit < 0) throw new Error('CLUEKEEPER_MODEL_CALLS_PER_DAY must be a nonnegative integer.');
const port = Number(process.env.CLUEKEEPER_PORT ?? process.env.PORT ?? 3230);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid CLUEKEEPER_PORT.');
const store = new Store(process.env.CLUEKEEPER_DATABASE_PATH ?? '.local/cluekeeper.sqlite');
const app = createApp({ store, production, origin, modelLimit,
  interpreter: enabled ? createBedrockInterpreter(region!, model!) : undefined,
  modelLabel: enabled ? `Bedrock · ${model}` : undefined,
});
const server = app.listen(port, process.env.CLUEKEEPER_HOST ?? process.env.HOST ?? '127.0.0.1', () => {
  console.log(`ClueKeeper listening on port ${port}; model ${enabled ? 'configured, proposals require confirmation' : 'disabled'}.`);
});
const stop = () => {
  server.close(() => { store.close(); process.exit(0); });
  server.closeIdleConnections();
  setTimeout(() => server.closeAllConnections(), 5000).unref();
};
process.once('SIGTERM', stop);
process.once('SIGINT', stop);
