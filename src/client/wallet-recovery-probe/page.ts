import { t, translatedError } from '../../shared/i18n/index.ts';
import { startLanguage } from '../language/index.ts';
import { discoverWallets } from '../wallet/index.ts';
import type { WalletConnection } from '../wallet/index.ts';
import {
  ProbeError,
  checkProbeIdentity,
  createProbeContext,
  openProbe,
  recoveryMessage,
  repeatableSignatures,
  sealProbe,
} from './index.ts';
import { ProbePacketSelection } from './packet-selection.ts';

startLanguage();
const storageKey = '0xdmme.wallet-recovery-experiment.v1';
const discovery = discoverWallets();
function element<T extends HTMLElement>(id: string, type: { new (): T }): T {
  const result = document.getElementById(id);
  if (!(result instanceof type)) throw new Error('Test interface missing.');
  return result;
}
const walletSelect = element('wallet', HTMLSelectElement);
const consent = element('consent', HTMLInputElement);
const status = element('status', HTMLElement);
const summary = element('packet-status', HTMLElement);
const fileInput = element('import', HTMLInputElement);
const buttons = ['create', 'recover', 'download', 'erase'].map((id) =>
  element(id, HTMLButtonElement),
);
const selection = new ProbePacketSelection({
  origin: location.origin,
  persist: (packet) => localStorage.setItem(storageKey, JSON.stringify(packet)),
});
let busy = false;
let generation = 0;
let blocked = false;

function render(): void {
  const target = selection.active;
  const unavailable = busy || blocked;
  walletSelect.disabled = unavailable;
  fileInput.disabled = unavailable;
  for (const button of buttons) button.disabled = unavailable;
  element('create', HTMLButtonElement).disabled ||=
    !consent.checked || target !== null;
  element('recover', HTMLButtonElement).disabled ||=
    !consent.checked || target === null;
  element('download', HTMLButtonElement).disabled ||= target === null;
  if (!target) {
    summary.textContent = t('No active package for recovery.');
    return;
  }
  const { context } = target.packet;
  const source =
    target.source.kind === 'file'
      ? t('Imported file: {0}', [target.source.name])
      : t("Package from this browser's storage");
  summary.textContent = t('{0}. Source account: {1} ({2}). Package ID: {3}.', [
    source,
    context.address,
    context.ecosystem.toUpperCase(),
    context.id.slice(0, 12),
  ]);
}
function refreshWallets(): void {
  const selected = walletSelect.value;
  const wallets = discovery.list();
  for (const name of ['MetaMask', 'Phantom', 'Backpack']) {
    for (const ecosystem of ['evm', 'solana'] as const) {
      const connection = discovery.get(`${name}:${ecosystem}`);
      if (
        connection &&
        !wallets.some(
          (wallet) => wallet.name === name && wallet.ecosystem === ecosystem,
        )
      )
        wallets.push(connection);
    }
  }
  walletSelect.replaceChildren();
  for (const wallet of wallets) {
    const option = document.createElement('option');
    option.value = wallet.id;
    option.textContent = t('{0} — {1}', [
      wallet.name,
      wallet.ecosystem.toUpperCase(),
    ]);
    walletSelect.append(option);
  }
  if (wallets.some((wallet) => wallet.id === selected))
    walletSelect.value = selected;
  if (!wallets.length) {
    status.textContent = t(
      'No wallets detected. Open this address in a browser with your test wallet; do not use an account with funds.',
    );
  }
}
function selectedWallet(): WalletConnection {
  const wallet = discovery.get(walletSelect.value);
  if (!wallet) throw new ProbeError('No test wallet available.');
  return wallet;
}
function current(token: number): void {
  if (token !== generation || blocked || document.hidden)
    throw new ProbeError('Test interrupted; reload before retrying.');
}
async function run(
  operation: (token: number) => Promise<string>,
  pending = t('Test in progress. Check the exclusive message in your wallet.'),
): Promise<void> {
  if (busy || blocked) return;
  busy = true;
  const token = ++generation;
  status.textContent = pending;
  render();
  const timeout = setTimeout(() => {
    blocked = true;
    generation++;
    status.textContent = t(
      'The wallet did not finish within two minutes. Reload before trying again.',
    );
    render();
  }, 120_000);
  try {
    const result = await operation(token);
    current(token);
    status.textContent = result;
  } catch (error: unknown) {
    if (token === generation)
      status.textContent =
        error instanceof ProbeError
          ? translatedError(error.message)
          : t(
              'Test refused. Check the account, signature and storage availability; no success was confirmed.',
            );
  } finally {
    clearTimeout(timeout);
    busy = false;
    render();
  }
}
async function create(token: number): Promise<string> {
  if (!consent.checked || selection.active)
    throw new ProbeError(
      'The test already has a package or fictional data use has not been confirmed.',
    );
  const wallet = selectedWallet();
  const identity = await wallet.identity(true);
  current(token);
  const context = createProbeContext({ origin: location.origin, identity });
  const message = recoveryMessage(context);
  const first = await wallet.sign(message, identity.address);
  current(token);
  const second = await wallet.sign(message, identity.address);
  current(token);
  if (!repeatableSignatures({ context, first, second }))
    throw new ProbeError(
      'Both signatures are valid but different. This attempt cannot provide stable recovery.',
    );
  const sealed = await sealProbe(context, first);
  const actual = await wallet.identity(false);
  current(token);
  checkProbeIdentity({
    packet: sealed,
    origin: location.origin,
    identity: actual,
  });
  selection.created(sealed);
  return t(
    'Two identical signatures; fictional package encrypted and saved. Reload and test recovery. This does not verify another device or wallet implementation.',
  );
}
async function recover(token: number): Promise<string> {
  if (!consent.checked)
    throw new ProbeError('Import or create a fictional package first.');
  const { packet: value } = selection.requireTarget();
  const wallet = selectedWallet();
  const identity = await wallet.identity(true);
  current(token);
  checkProbeIdentity({ packet: value, origin: location.origin, identity });
  const signature = await wallet.sign(
    recoveryMessage(value.context),
    identity.address,
  );
  current(token);
  const actual = await wallet.identity(false);
  current(token);
  await openProbe({
    packet: value,
    origin: location.origin,
    identity: actual,
    signature,
  });
  current(token);
  return t(
    'Package {0} recovered with a new signature from account {1}. No previous signature or key was kept by the laboratory.',
    [value.context.id.slice(0, 12), value.context.address],
  );
}
function download(): void {
  const packet = selection.active?.packet;
  if (!packet || busy || blocked) return;
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(packet)], { type: 'application/json' }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = `0xdmme-ensaio-${packet.context.ecosystem}-${packet.context.address.slice(0, 8)}-${packet.context.id.slice(0, 12)}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
element('create', HTMLButtonElement).onclick = () => {
  void run(create);
};
element('recover', HTMLButtonElement).onclick = () => {
  void run(recover);
};
element('download', HTMLButtonElement).onclick = download;
element('erase', HTMLButtonElement).onclick = () => {
  if (busy || blocked) return;
  try {
    localStorage.removeItem(storageKey);
    selection.clear();
    status.textContent = t("Only this test's fictional package was deleted.");
  } catch {
    status.textContent = t('Could not delete the fictional package.');
  }
  render();
};
fileInput.onchange = () => {
  const file = fileInput.files?.[0];
  fileInput.value = '';
  if (!file || busy || blocked) return;
  selection.clear();
  render();
  void run(async (token) => {
    const target = await selection.importFile(file, () => current(token));
    return t(
      'File imported. The active package is now {0}. Select the source account and click Test this package.',
      [target.packet.context.id.slice(0, 12)],
    );
  }, t('Reading and validating the selected file.'));
};
walletSelect.onchange = () => {
  status.textContent = t(
    "Selected wallet changed. Check the active package's source account and test again.",
  );
};
consent.onchange = render;
discovery.onChange(refreshWallets);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden || !busy) return;
  generation++;
  blocked = true;
  status.textContent = t(
    'The test was hidden during the operation. Reload; no delayed result will be saved.',
  );
  render();
});
window.addEventListener('pagehide', () => {
  generation++;
  discovery.close();
});
try {
  const stored = localStorage.getItem(storageKey);
  if (stored) selection.restore(stored);
} catch {
  blocked = true;
  status.textContent = t(
    'Storage unavailable or package invalid. Use a clean test browser profile.',
  );
}
refreshWallets();
render();
