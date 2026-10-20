import { t } from '../../shared/i18n/index.ts';
import { startLanguage } from '../language/index.ts';
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
import { applyTheme, storedTheme } from '../appearance/index.ts';
import { recoveryApi } from './index.ts';
import { startScrollbarFade } from '../scrollbars/index.ts';

startLanguage();
startScrollbarFade();
applyTheme(storedTheme().theme);

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
    throw new Error('Invalid deadline.');
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
    throw new Error('Destination changed.');
}
async function prepare(): Promise<void> {
  if (document.documentElement.hasAttribute('data-recovery-rejected'))
    throw new Error('Request ended.');
  const prepared = generation;
  const entry = recoveryEntry(location.pathname);
  if (!entry || location.search || location.hash)
    throw new Error('Invalid entry.');
  if (!button || !status || !message) throw new Error('Interface missing.');
  const data = object(await recoveryApi('request', entry));
  keys(data, ['transfer', 'expiresAt', 'serverTime']);
  const transfer = recoveryTransfer(data['transfer']);
  await verifyDestination(transfer, entry);
  const deadline = recoveryDeadline(data);
  if (prepared !== generation) return;
  message.textContent = recoveryMessage(transfer.config);
  status.textContent = t(
    'You are {0} your data with {1}. Only confirm the request you opened in your browser. Then return to it.',
    [transfer.count === 2 ? t('setting up') : t('recovering'), transfer.wallet],
  );
  button.disabled = false;
  button.onclick = () => {
    button.disabled = true;
    const token = ++generation;
    const current = () => {
      if (token !== generation || Date.now() > deadline)
        throw new Error('Request ended.');
    };
    const send = async () => {
      const wallet = discovery.get(
        `${transfer.wallet}:${transfer.config.ecosystem}`,
      );
      if (!wallet) throw new Error('Wallet unavailable.');
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
      status.textContent = t(
        'Encrypted result sent. Return to the original browser; account opening will finish automatically. This page does not create a session or authorize devices.',
      );
    };
    void send().catch(() => {
      if (token === generation)
        status.textContent = t(
          'Recovery not completed. Check your account and connection; restart the request in the original browser.',
        );
    });
  };
}
void prepare().catch(() => {
  if (status)
    status.textContent = t(
      'Request invalid, changed, expired or unavailable. Restart from the original browser.',
    );
});
