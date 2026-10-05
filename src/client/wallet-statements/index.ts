import type { WalletConnection, WalletIdentity } from '../wallet/index.ts';
import { canonicalAddress } from '../../shared/wallet-identity/index.ts';
import { verifyWalletStatement } from '../../shared/representatives/index.ts';
import type { RepresentativeIdentity } from '../../shared/representatives/index.ts';
async function walletOperation<T>(operation: () => Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new Error('A wallet não concluiu a assinatura. Tente novamente.'),
            ),
          120_000,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
/** A bounded request in the connected wallet. No cross-browser return channel. */
export async function signWalletStatement(input: {
  wallet: WalletConnection;
  identity: RepresentativeIdentity;
  message: string;
  current: () => void;
}): Promise<string> {
  const { wallet, identity, message, current } = input;
  const check = (actual: WalletIdentity) => {
    current();
    if (
      actual.ecosystem !== identity.ecosystem ||
      canonicalAddress(identity.ecosystem, actual.address) !== identity.address
    )
      throw new Error('Selecione a wallet da conta aberta.');
  };
  check(await walletOperation(() => wallet.identity(true)));
  const signature = await walletOperation(() =>
    wallet.sign(message, identity.address),
  );
  check(await walletOperation(() => wallet.identity(false)));
  verifyWalletStatement(identity, message, signature);
  return signature;
}
