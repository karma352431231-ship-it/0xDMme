import { chmod } from 'node:fs/promises';
import { readPushConfiguration } from './network.ts';
import { validatePushSocket, validatePushToken } from './client.ts';
import { createPushSender } from './service.ts';
import { preparePushSocket } from './socket.ts';

let started: ReturnType<typeof createPushSender> | undefined;
try {
  const config = readPushConfiguration(process.env);
  if (!config) throw new Error('VAPID ausente.');
  const socketPath = process.env['HASH_TALK_PUSH_SOCKET'];
  const token = process.env['HASH_TALK_PUSH_TOKEN'];
  validatePushSocket(socketPath);
  validatePushToken(token);
  await preparePushSocket(socketPath!);
  const server = createPushSender({ config, token: token! });
  started = server;
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(socketPath!, resolve);
  });
  await chmod(socketPath!, 0o660);
  const close = () => {
    const deadline = setTimeout(() => process.exit(1), 9000);
    deadline.unref();
    server.close(() => clearTimeout(deadline));
  };
  server.on('error', () => {
    process.exitCode = 1;
    close();
  });
  process.once('SIGTERM', close);
  process.once('SIGINT', close);
} catch {
  started?.close();
  process.stderr.write(
    'Emissor push não iniciado; confira configuração privada.\n',
  );
  process.exitCode = 1;
}
