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

const storageKey = '0xdmme.wallet-recovery-experiment.v1';
const discovery = discoverWallets();
function element<T extends HTMLElement>(id: string, type: { new (): T }): T {
  const result = document.getElementById(id);
  if (!(result instanceof type))
    throw new Error('Interface do ensaio ausente.');
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
    summary.textContent = 'Nenhum pacote ativo para recuperação.';
    return;
  }
  const { context } = target.packet;
  const source =
    target.source.kind === 'file'
      ? `Arquivo importado: ${target.source.name}`
      : 'Pacote do armazenamento deste navegador';
  summary.textContent = `${source}. Conta de origem: ${context.address} (${context.ecosystem.toUpperCase()}). Identificador do pacote: ${context.id.slice(0, 12)}.`;
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
    option.textContent = `${wallet.name} — ${wallet.ecosystem.toUpperCase()}`;
    walletSelect.append(option);
  }
  if (wallets.some((wallet) => wallet.id === selected))
    walletSelect.value = selected;
  if (!wallets.length) {
    status.textContent =
      'Nenhuma wallet detectada. Abra este endereço em um navegador com sua wallet de teste; não use uma conta com fundos.';
  }
}
function selectedWallet(): WalletConnection {
  const wallet = discovery.get(walletSelect.value);
  if (!wallet) throw new ProbeError('Nenhuma wallet de teste disponível.');
  return wallet;
}
function current(token: number): void {
  if (token !== generation || blocked || document.hidden)
    throw new ProbeError(
      'Ensaio interrompido; recarregue antes de tentar novamente.',
    );
}
async function run(
  operation: (token: number) => Promise<string>,
  pending = 'Ensaio em andamento. Confira a mensagem exclusiva na wallet.',
): Promise<void> {
  if (busy || blocked) return;
  busy = true;
  const token = ++generation;
  status.textContent = pending;
  render();
  const timeout = setTimeout(() => {
    blocked = true;
    generation++;
    status.textContent =
      'A wallet não concluiu em dois minutos. Recarregue antes de tentar novamente.';
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
          ? error.message
          : 'Ensaio recusado. Confira a conta, a assinatura e a disponibilidade do armazenamento; nenhum sucesso foi confirmado.';
  } finally {
    clearTimeout(timeout);
    busy = false;
    render();
  }
}
async function create(token: number): Promise<string> {
  if (!consent.checked || selection.active)
    throw new ProbeError(
      'O ensaio já tem um pacote ou falta confirmar o uso de dados fictícios.',
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
      'As duas assinaturas são válidas, mas diferentes. Esta tentativa não permite recuperação estável.',
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
  return 'Duas assinaturas iguais; pacote fictício cifrado e guardado. Recarregue e teste recuperar. Isto não comprova outro aparelho ou outra implementação da wallet.';
}
async function recover(token: number): Promise<string> {
  if (!consent.checked)
    throw new ProbeError('Importe ou crie um pacote fictício primeiro.');
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
  return `Pacote ${value.context.id.slice(0, 12)} recuperado com nova assinatura da conta ${value.context.address}. Nenhuma assinatura ou chave anterior foi guardada pelo laboratório.`;
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
    status.textContent = 'Somente o pacote fictício deste ensaio foi apagado.';
  } catch {
    status.textContent = 'Não foi possível apagar o pacote fictício.';
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
    return `Arquivo importado. O pacote ativo agora é ${target.packet.context.id.slice(0, 12)}. Selecione a conta de origem e clique em Testar este pacote.`;
  }, 'Lendo e validando o arquivo escolhido.');
};
walletSelect.onchange = () => {
  status.textContent =
    'Wallet selecionada mudou. Confira a conta de origem do pacote ativo e teste novamente.';
};
consent.onchange = render;
discovery.onChange(refreshWallets);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden || !busy) return;
  generation++;
  blocked = true;
  status.textContent =
    'O ensaio foi ocultado durante a operação. Recarregue; nenhum resultado atrasado será guardado.';
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
  status.textContent =
    'Armazenamento indisponível ou pacote inválido. Use um perfil de navegador de teste limpo.';
}
refreshWallets();
render();
