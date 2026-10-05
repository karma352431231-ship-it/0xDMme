import { verifyMessage } from 'ethers/hash';
import { base58 } from '@scure/base';
import { ed25519 } from '@noble/curves/ed25519';
import { AccountError } from '../account/index.ts';
import { canonicalAddress, solanaPublicKey } from '../wallet-identity/index.ts';
import type { Ecosystem } from '../wallet-identity/index.ts';

/** Verifies the existing EOA/message-signing wallet capabilities, never a login signature. */
export function verifyWalletStatement(
  identity: { ecosystem: Ecosystem; address: string },
  message: string,
  signature: string,
): void {
  try {
    const expected = canonicalAddress(identity.ecosystem, identity.address);
    if (identity.ecosystem === 'evm') {
      if (
        !/^0x[0-9a-fA-F]{130}$/u.test(signature) ||
        canonicalAddress('evm', verifyMessage(message, signature)) !== expected
      )
        throw new Error('Assinatura inválida.');
      return;
    }
    const key = solanaPublicKey(expected),
      point = ed25519.Point.fromBytes(key, false),
      bytes = base58.decode(signature);
    if (
      point.isSmallOrder() ||
      !point.isTorsionFree() ||
      bytes.length !== 64 ||
      base58.encode(bytes) !== signature
    )
      throw new Error('Chave/assinatura inválida.');
    if (
      !ed25519.verify(bytes, new TextEncoder().encode(message), key, {
        zip215: false,
      })
    )
      throw new Error('Assinatura inválida.');
  } catch {
    throw new AccountError(403, 'Assinatura da autorização inválida.');
  }
}
