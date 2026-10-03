import { startWalletRecoveryProbe } from './wallet-recovery-probe/index.ts';

const server = await startWalletRecoveryProbe({
  synthetic: process.argv.includes('--synthetic'),
});
process.stdout.write(
  'Ensaio local: http://127.0.0.1:45107 — encerra em 30 minutos.\n',
);
if (process.argv.includes('--synthetic'))
  process.stdout.write('Modo fictício: nenhuma wallet real é usada.\n');
const close = () => {
  server.close();
  server.closeAllConnections();
};
process.once('SIGINT', close);
process.once('SIGTERM', close);
