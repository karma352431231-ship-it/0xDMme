import { Signature } from 'ethers/crypto';
import { getBytes } from 'ethers/utils';
import { verifyMessage } from 'ethers/hash';
import { ed25519 } from '@noble/curves/ed25519';
import { base58 } from '@scure/base';
import { base64, encode } from '../../shared/account/index.ts';
import { solanaPublicKey } from '../../shared/wallet-identity/index.ts';
import {
  recoveryIdentity,
  recoveryMessage,
  walletRecovery,
} from '../../shared/wallet-recovery/index.ts';
import type { WalletRecovery } from '../../shared/wallet-recovery/index.ts';
import type { AccountSession } from '../../shared/account/index.ts';
import type { WalletConnection } from '../wallet/index.ts';

export function createWalletRecovery(
  session: AccountSession,
  origin: string,
): WalletRecovery {
  return walletRecovery({
    version: 1,
    accountId: session.accountId,
    origin,
    ecosystem: session.ecosystem,
    address: session.address,
    id: crypto.randomUUID(),
    salt: encode(crypto.getRandomValues(new Uint8Array(32))),
  });
}
function signatureBytes(
  config: WalletRecovery,
  signature: string,
): Uint8Array<ArrayBuffer> {
  try {
    return verifiedBytes(config, signature);
  } catch {
    throw new Error(
      'Assinatura de recuperação rejeitada: wallet, mensagem ou integridade inválida.',
    );
  }
}
function verifiedBytes(
  config: WalletRecovery,
  signature: string,
): Uint8Array<ArrayBuffer> {
  const message = recoveryMessage(config);
  if (config.ecosystem === 'evm') {
    if (!/^0x[0-9a-fA-F]{130}$/u.test(signature))
      throw new Error('Assinatura de recuperação inválida.');
    const normalized = Signature.from(signature).serialized;
    if (verifyMessage(message, normalized).toLowerCase() !== config.address)
      throw new Error('A assinatura pertence a outra wallet.');
    return Uint8Array.from(getBytes(normalized));
  }
  if (!/^[1-9A-HJ-NP-Za-km-z]{64,88}$/u.test(signature))
    throw new Error('Assinatura de recuperação inválida.');
  const bytes = Uint8Array.from(base58.decode(signature));
  if (
    bytes.length !== 64 ||
    !ed25519.verify(
      bytes,
      new TextEncoder().encode(message),
      solanaPublicKey(config.address),
      { zip215: false },
    )
  )
    throw new Error('A assinatura pertence a outra wallet.');
  return bytes;
}
export async function walletRecoveryKey(
  config: WalletRecovery,
  signatures: string[],
): Promise<CryptoKey> {
  walletRecovery(config);
  if (signatures.length < 1 || signatures.length > 2)
    throw new Error('Assinaturas de recuperação ausentes.');
  const first = signatureBytes(config, signatures[0] ?? '');
  try {
    for (const signature of signatures.slice(1)) {
      const other = signatureBytes(config, signature);
      const equal = first.every((byte, index) => byte === other[index]);
      other.fill(0);
      if (!equal)
        throw new Error(
          'A wallet gerou assinaturas diferentes. Use outro aparelho autorizado por QR; esta tentativa não configurou recuperação.',
        );
    }
    const material = await crypto.subtle.importKey(
      'raw',
      first,
      'HKDF',
      false,
      ['deriveKey'],
    );
    return await crypto.subtle.deriveKey(
      {
        name: 'HKDF',
        hash: 'SHA-256',
        salt: base64(config.salt, 32),
        info: new TextEncoder().encode(
          `0xdmme-wallet-recovery-key-v1\n${recoveryMessage(config)}`,
        ),
      },
      material,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt'],
    );
  } finally {
    first.fill(0);
  }
}
export async function signRecovery(input: {
  wallet: WalletConnection;
  config: WalletRecovery;
  count: 1 | 2;
  current: () => void;
}): Promise<string[]> {
  const signatures: string[] = [];
  const { wallet, config } = input;
  try {
    for (let index = 0; index < input.count; index++) {
      const identity = await walletOperation(() => wallet.identity(true));
      input.current();
      recoveryIdentity(
        config,
        { ...identity, accountId: config.accountId },
        config.origin,
      );
      const signature = await walletOperation(() =>
        wallet.sign(recoveryMessage(config), identity.address),
      );
      input.current();
      const actual = await walletOperation(() => wallet.identity(false));
      recoveryIdentity(
        config,
        { ...actual, accountId: config.accountId },
        config.origin,
      );
      signatureBytes(config, signature).fill(0);
      signatures.push(signature);
    }
    // Check reproducibility before returning or forwarding encrypted material.
    await walletRecoveryKey(config, signatures);
    input.current();
    return signatures;
  } catch (error: unknown) {
    signatures.fill('');
    throw error;
  }
}
async function walletOperation<T>(operation: () => Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation(),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error('timeout')), 120_000);
      }),
    ]);
  } catch {
    throw new Error(
      'Assinatura não concluída na wallet. Confira a conta e tente novamente.',
    );
  } finally {
    clearTimeout(timer);
  }
}
