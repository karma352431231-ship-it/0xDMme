import { resolve } from 'node:path';
import {
  readMediaRuntime,
  verifyMediaBudget,
} from '../community-media/index.ts';
import { MediaWorkerServer } from './server.ts';

const runtime = readMediaRuntime(process.env);
if (!runtime || runtime.socket)
  throw new Error('Runtime local do worker ausente.');
if (
  process.env['LISTEN_PID'] !== String(process.pid) ||
  process.env['LISTEN_FDS'] !== '1'
)
  throw new Error('Socket isolado ausente.');
const root = process.env['HASH_TALK_MEDIA_ROOT'];
if (!root || resolve(root) !== root || !root.endsWith('/community-media'))
  throw new Error('Namespace público ausente.');
await verifyMediaBudget(runtime);
const worker = new MediaWorkerServer({ runtime, root });
worker.server.listen({ fd: 3 });
const stop = (): void => {
  void worker.close().catch(() => {
    process.exitCode = 1;
  });
};
worker.server.on('error', () => {
  process.exitCode = 1;
  stop();
});
process.once('SIGTERM', stop);
process.once('SIGINT', stop);
