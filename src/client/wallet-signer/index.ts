import { canonicalAddress } from '../../shared/wallet-identity/index.ts';
import type { WalletRecovery } from '../../shared/wallet-recovery/index.ts';
import type { WalletConnection } from '../wallet/index.ts';
import { signRecovery } from '../wallet-recovery/index.ts';

/** Signs a wallet's recovery statement `count` times; the results match. */
export type RecoverySigner = (
  config: WalletRecovery,
  count: 1 | 2,
  current: () => void,
) => Promise<string[]>;

type Wallet = Pick<WalletRecovery, 'ecosystem' | 'address'>;

async function presents(
  connection: WalletConnection,
  wallet: Wallet,
  access: boolean,
): Promise<boolean> {
  if (connection.ecosystem !== wallet.ecosystem) return false;
  try {
    const identity = await connection.identity(access);
    return (
      canonicalAddress(identity.ecosystem, identity.address) === wallet.address
    );
  } catch {
    // A wallet that is locked or refuses access simply is not the one.
    return false;
  }
}
async function find(
  connections: WalletConnection[],
  wallet: Wallet,
  access: boolean,
): Promise<WalletConnection | undefined> {
  for (const connection of connections)
    if (await presents(connection, wallet, access)) return connection;
  return undefined;
}

/** The first of `wallets` that a detected connection presents right now. */
export async function presentedWallet<T extends Wallet>(
  connections: WalletConnection[],
  wallets: T[],
): Promise<T | undefined> {
  for (const wallet of wallets)
    if (await find(connections, wallet, false)) return wallet;
  return undefined;
}
/**
 * A signer over the wallets detected in this browser. It uses the connection
 * that currently presents the wallet a statement belongs to. When none does,
 * `select` asks the user to select that wallet in their wallet app, and the
 * signer looks once more before giving up.
 */
export function detectedWalletSigner(input: {
  connections: () => WalletConnection[];
  select: (wallet: Wallet) => Promise<void>;
}): RecoverySigner {
  return async (config, count, current) => {
    let connection = await find(input.connections(), config, false);
    if (!connection) {
      await input.select(config);
      current();
      connection = await find(input.connections(), config, true);
    }
    if (!connection)
      throw new Error(
        'The wallet needed for this step is not selected in this browser.',
      );
    return signRecovery({ wallet: connection, config, count, current });
  };
}
