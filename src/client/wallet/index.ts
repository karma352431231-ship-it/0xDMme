import { getWallets } from '@wallet-standard/app';
import { evmProvider, evmIdentity, signEvm } from './evm.ts';
import {
  supportsSolana,
  standardIdentity,
  signStandard,
  observeStandard,
  solanaProvider,
  legacyIdentity,
  signLegacy,
} from './solana.ts';
import type { EvmProvider } from './evm.ts';
import type { Ecosystem } from '../../shared/wallet-identity/index.ts';
export type { EvmProvider } from './evm.ts';
import type { WalletName } from '../../shared/wallet-approval/index.ts';
import { returnBrowser } from '../../shared/wallet-approval/index.ts';
import type { ReturnBrowser } from '../../shared/wallet-approval/index.ts';
export type { WalletName } from '../../shared/wallet-approval/index.ts';
export interface WalletIdentity {
  address: string;
  ecosystem: Ecosystem;
  chainId: number | string;
}
export interface WalletConnection {
  id: string;
  name: string;
  ecosystem: Ecosystem;
  identity: (requestAccess: boolean) => Promise<WalletIdentity>;
  sign: (message: string, address: string) => Promise<string>;
  observe: (listener: () => void) => () => void;
}
function observeEvents(
  instance: Pick<EvmProvider, 'on' | 'removeListener'>,
  listener: () => void,
) {
  const names = [
    'accountsChanged',
    'accountChanged',
    'chainChanged',
    'disconnect',
  ];
  for (const name of names) instance.on?.(name, listener);
  return () => {
    for (const name of names) instance.removeListener?.(name, listener);
  };
}
function evmConnection(
  id: string,
  name: string,
  instance: EvmProvider,
): WalletConnection {
  return {
    id,
    name,
    ecosystem: 'evm',
    identity: (access) => evmIdentity(instance, access),
    sign: (message, address) => signEvm(instance, message, address),
    observe: (listener) => observeEvents(instance, listener),
  };
}
const known = new Map([
  ['io.metamask', 'MetaMask'],
  ['app.phantom', 'Phantom'],
  ['app.backpack', 'Backpack'],
]);
function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : null;
}
function announcementInfo(value: unknown): { id: string; name: string } | null {
  const info = record(value);
  if (!info) return null;
  const id = info['uuid'];
  const name = info['name'];
  if (
    typeof id !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
      id,
    )
  )
    return null;
  if (
    typeof name !== 'string' ||
    name.length < 1 ||
    name.length > 80 ||
    /[\p{Cc}\p{Cf}]/u.test(name)
  )
    return null;
  return { id, name: known.get(String(info['rdns'])) ?? name };
}
function announcement(value: unknown): WalletConnection | null {
  const detail = record(value);
  if (!detail) return null;
  const info = announcementInfo(detail['info']);
  const instance = evmProvider(detail['provider']);
  return info && instance && !/^Solflare$/iu.test(info.name)
    ? evmConnection(info.id, info.name, instance)
    : null;
}
export function discoverWallets() {
  const found = new Map<string, WalletConnection>();
  const listeners = new Set<() => void>();
  const notify = () => {
    for (const listener of listeners) listener();
  };
  const announce = (event: Event) => {
    if (!(event instanceof CustomEvent)) return;
    const result = announcement(event.detail);
    if (result && (found.has(result.id) || found.size < 32)) {
      found.set(result.id, result);
      notify();
    }
  };
  window.addEventListener('eip6963:announceProvider', announce);
  window.dispatchEvent(new Event('eip6963:requestProvider'));
  const registry = getWallets();
  const offRegister = registry.on('register', notify);
  const offUnregister = registry.on('unregister', notify);
  function connections(): WalletConnection[] {
    const results = [...found.values()];
    for (const wallet of registry.get().slice(0, 32)) {
      if (/^Solflare$/iu.test(wallet.name) || !supportsSolana(wallet)) continue;
      results.push({
        id: `standard:${wallet.name}`,
        name: wallet.name.slice(0, 80),
        ecosystem: 'solana',
        identity: (access) => standardIdentity(wallet, access),
        sign: (message, address) => signStandard(wallet, message, address),
        observe: (listener) => observeStandard(wallet, listener),
      });
    }
    return results;
  }
  return {
    list: connections,
    onChange(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    get(id: string): WalletConnection | undefined {
      const entries = connections();
      const exact = entries.find((wallet) => wallet.id === id);
      if (exact) return exact;
      const [name, network = 'evm'] = id.split(':');
      const matching = entries.find(
        (wallet) => wallet.name === name && wallet.ecosystem === network,
      );
      return matching ?? legacyConnection(name ?? '', network);
    },
    close() {
      window.removeEventListener('eip6963:announceProvider', announce);
      offRegister();
      offUnregister();
      listeners.clear();
    },
  };
}
function legacyConnection(
  name: string,
  network: string,
): WalletConnection | undefined {
  return network === 'evm' ? legacyEvm(name) : legacySolana(name);
}
function legacyEvm(name: string): WalletConnection | undefined {
  const globals = window as Window & {
    ethereum?: unknown;
    phantom?: { ethereum?: unknown };
    backpack?: { ethereum?: unknown };
  };
  const providers: Record<string, unknown> = {
    MetaMask: globals.ethereum,
    Phantom: globals.phantom?.ethereum,
    Backpack: globals.backpack?.ethereum,
  };
  const instance = evmProvider(providers[name]);
  if (!instance) return;
  if (
    name === 'MetaMask' &&
    !('isMetaMask' in instance && instance.isMetaMask === true)
  )
    return;
  return evmConnection(name, name, instance);
}
function legacySolana(name: string): WalletConnection | undefined {
  const globals = window as Window & {
    phantom?: { solana?: unknown };
    backpack?: { solana?: unknown };
  };
  const providers: Record<string, unknown> = {
    Phantom: globals.phantom?.solana,
    Backpack: globals.backpack?.solana ?? globals.backpack,
  };
  const instance = solanaProvider(providers[name]);
  if (!instance) return;
  return {
    id: `${name}:solana`,
    name,
    ecosystem: 'solana',
    identity: (access) => legacyIdentity(instance, access),
    sign: (message, address) => signLegacy(instance, message, address),
    observe: (listener) => observeEvents(instance, listener),
  };
}
export { evmIdentity, signEvm } from './evm.ts';
export function walletBrowserUrl(input: {
  origin: string;
  wallet: WalletName;
  ticket: string;
  ecosystem: Ecosystem;
  returnBrowser?: ReturnBrowser;
  platform?: 'android' | 'other';
}): string | null {
  const origin = new URL(input.origin);
  if (
    origin.protocol !== 'https:' ||
    origin.hostname === 'localhost' ||
    origin.hostname === '127.0.0.1'
  )
    return null;
  if (!/^[a-f0-9]{64}$/u.test(input.ticket))
    throw new Error('Pedido inválido.');
  const query = new URLSearchParams({
    ticket: input.ticket,
    ecosystem: input.ecosystem,
    wallet: input.wallet,
    ...(input.returnBrowser === undefined
      ? {}
      : { returnBrowser: returnBrowser(input.returnBrowser) }),
  });
  const target = `${origin.origin}/wallet-entry?${query}`;
  if (input.wallet === 'MetaMask')
    // MetaMask appends everything after /dapp/ to https:// without decoding
    // the path. Preserve URL delimiters; query values are already encoded.
    return `https://link.metamask.io/dapp/${target.slice('https://'.length)}`;
  // HTTPS v1 without an outer ref was verified on Android, including a closed
  // Backpack app. Keep the encoded destination and its login parameters intact.
  if (input.wallet === 'Backpack' && input.platform === 'android')
    return `https://backpack.app/ul/v1/browse/${encodeURIComponent(target)}`;
  const base = {
    Phantom: 'https://phantom.app/ul/browse/',
    Backpack: 'https://backpack.app/ul/v1/browse/',
  }[input.wallet];
  return `${base}${encodeURIComponent(target)}?ref=${encodeURIComponent(origin.origin)}`;
}
