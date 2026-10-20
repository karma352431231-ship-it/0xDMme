import { startWalletRecoveryProbe } from './wallet-recovery-probe/index.ts';

const server = await startWalletRecoveryProbe({
  synthetic: process.argv.includes('--synthetic'),
});
process.stdout.write(
  'Local probe: http://127.0.0.1:45107 — closes in 30 minutes.\n',
);
if (process.argv.includes('--synthetic'))
  process.stdout.write('Synthetic mode: no real wallet is used.\n');
const close = () => {
  server.close();
  server.closeAllConnections();
};
process.once('SIGINT', close);
process.once('SIGTERM', close);
