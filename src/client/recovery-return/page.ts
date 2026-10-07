import { keys, object, boundedText } from '../../shared/account/index.ts';
import { canonical, digest } from '../../shared/devices/index.ts';
import {
  recoveryEntry,
  recoveryTransfer,
  transferContext,
  recoveryMessage,
} from '../../shared/wallet-recovery/index.ts';
import type { RecoveryTransfer } from '../../shared/wallet-recovery/index.ts';
import { sealTo } from '../device-keys/index.ts';
import { discoverWallets } from '../wallet/index.ts';
import { signRecovery } from '../wallet-recovery/index.ts';
import { recoveryApi } from './index.ts';

const status = document.querySelector<HTMLElement>('[data-status]');
const message = document.querySelector<HTMLElement>('[data-message]');
const button = document.querySelector<HTMLButtonElement>('[data-sign]');
const discovery = discoverWallets();
let generation = 0;
window.addEventListener('pagehide', () => {
  generation++;
  discovery.close();
});
function recoveryDeadline(data: Record<string, unknown>): number {
  const remaining =
    Date.parse(boundedText(data['expiresAt'], 32)) -
    Date.parse(boundedText(data['serverTime'], 32));
  if (!Number.isFinite(remaining) || remaining <= 0 || remaining > 300_000)
    throw new Error('Prazo inválido.');
  return Date.now() + remaining;
}
async function verifyDestination(
  transfer: RecoveryTransfer,
  entry: { ticket: string; commitment: string },
): Promise<void> {
  if (
    transfer.ticket !== entry.ticket ||
    transfer.config.origin !== location.origin ||
    (await digest(canonical(transfer))) !== entry.commitment
  )
    throw new Error('Destino alterado.');
}
async function prepare(): Promise<void> {
  if (document.documentElement.hasAttribute('data-recovery-rejected'))
    throw new Error('Pedido encerrado.');
  const prepared = generation;
  const entry = recoveryEntry(location.pathname);
  if (!entry || location.search || location.hash)
    throw new Error('Entrada inválida.');
  if (!button || !status || !message) throw new Error('Interface ausente.');
  const data = object(await recoveryApi('request', entry));
  keys(data, ['transfer', 'expiresAt', 'serverTime']);
  const transfer = recoveryTransfer(data['transfer']);
  await verifyDestination(transfer, entry);
  const deadline = recoveryDeadline(data);
  if (prepared !== generation) return;
  message.textContent = recoveryMessage(transfer.config);
  status.textContent = `Você está ${transfer.count === 2 ? 'configurando' : 'recuperando'} seus dados com ${transfer.wallet}. Confirme somente o pedido que abriu no seu navegador. Depois volte a ele.`;
  button.disabled = false;
  button.onclick = () => {
    button.disabled = true;
    const token = ++generation;
    const current = () => {
      if (token !== generation || Date.now() > deadline)
        throw new Error('Pedido encerrado.');
    };
    const send = async () => {
      const wallet = discovery.get(
        `${transfer.wallet}:${transfer.config.ecosystem}`,
      );
      if (!wallet) throw new Error('Wallet indisponível.');
      const signatures = await signRecovery({
        wallet,
        config: transfer.config,
        count: transfer.count,
        current,
      });
      let envelope;
      try {
        current();
        envelope = await sealTo(
          transfer.receiver,
          { signatures },
          transferContext(transfer),
        );
      } finally {
        signatures.fill('');
      }
      current();
      await recoveryApi('submit', { ...entry, envelope });
      current();
      status.textContent =
        'Resultado cifrado enviado. Volte ao navegador original; a abertura da conta será concluída automaticamente. Esta página não cria uma sessão ou autoriza aparelhos.';
    };
    void send().catch(() => {
      if (token === generation)
        status.textContent =
          'Recuperação não concluída. Confira a conta e a conexão; reinicie o pedido no navegador original.';
    });
  };
}
void prepare().catch(() => {
  if (status)
    status.textContent =
      'Pedido inválido, alterado, expirado ou indisponível. Reinicie pelo navegador original.';
});
