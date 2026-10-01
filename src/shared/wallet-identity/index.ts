import { base58 } from '@scure/base';
export type Ecosystem = 'evm' | 'solana';
export function ecosystem(value: unknown): Ecosystem {
  if (value !== 'evm' && value !== 'solana')
    throw new Error('Ecossistema inválido.');
  return value;
}
export function solanaPublicKey(address: unknown): Uint8Array<ArrayBuffer> {
  if (
    typeof address !== 'string' ||
    !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/u.test(address)
  )
    throw new Error('Endereço Solana inválido.');
  const bytes = base58.decode(address);
  if (bytes.length !== 32 || base58.encode(bytes) !== address)
    throw new Error('Endereço Solana inválido.');
  return Uint8Array.from(bytes);
}
export function canonicalAddress(network: Ecosystem, value: unknown): string {
  if (typeof value !== 'string') throw new Error('Endereço inválido.');
  if (network === 'solana') {
    solanaPublicKey(value);
    return value;
  }
  if (!/^0x[0-9a-fA-F]{40}$/u.test(value))
    throw new Error('Endereço EVM inválido.');
  return value.toLowerCase();
}
