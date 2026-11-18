import type { AccountSession } from '../../shared/account/index.ts';
import {
  accountWallets,
  sameWallet,
  walletAdditionRequest,
  walletAdditionStatement,
} from '../../shared/account-wallets/index.ts';
import type {
  AccountWallet,
  WalletIdentity,
} from '../../shared/account-wallets/index.ts';
import { canonicalAddress } from '../../shared/wallet-identity/index.ts';
import { verifyWalletStatement } from '../../shared/representatives/index.ts';
import { t, translatedError } from '../../shared/i18n/index.ts';
import { applicationOrigin } from '../application-origin/index.ts';
import { fetchApi, readApiJson } from '../api-response/index.ts';
import { mobilePlatform, walletPageUrl } from '../wallet/index.ts';
import type { WalletConnection, WalletName } from '../wallet/index.ts';
import { detectedWalletSigner } from '../wallet-signer/index.ts';
import type { RecoverySigner } from '../wallet-signer/index.ts';
import { showToast } from '../toast/index.ts';
import { shortAddress, walletCard } from './view.ts';

/** What this feature needs from the signed-in account. */
export interface AccountWalletHost {
  /** Wallets detected in this browser. */
  wallets: () => WalletConnection[];
  /** The detected wallet that confirmed the session, if this browser has it. */
  sessionWallet: () => WalletConnection | undefined;
  /** Which backup wallets open message history, and how that changes. */
  recovery: {
    wallets: () => WalletIdentity[];
    add: (input: {
      opener: WalletConnection;
      backup: WalletConnection;
      beforeBackup?: () => Promise<void>;
      register: (wallet: WalletIdentity) => Promise<void>;
    }) => Promise<void>;
    remove: (input: {
      opener: WalletConnection;
      wallet: WalletIdentity;
    }) => Promise<boolean>;
    /** True while the account's three wallets open history in pairs. */
    paired: () => boolean;
    enterPairs: (input: {
      sign: RecoverySigner;
      third: WalletIdentity;
      register: () => Promise<void>;
    }) => Promise<void>;
    leavePairs: (input: {
      sign: RecoverySigner;
      remove: WalletIdentity;
    }) => Promise<void>;
  };
  /** Runs wallet work that may switch the selected wallet account; the switch
   * signs the page out only after the work ends. */
  withAnotherWallet: <T>(work: () => Promise<T>) => Promise<T>;
  confirmWallet: () => void;
}

const walletTimeout = 120_000;
/** Wallet apps that can open this site in their own browser on a phone. */
const walletApps: readonly WalletName[] = ['Phantom', 'MetaMask', 'Backpack'];
/** Privacy and Security, where the Sign-in wallets group lives. */
const walletsPage = '/#settings?section=privacy';

async function post(
  operation: string,
  session: AccountSession,
  input: unknown,
): Promise<unknown> {
  const name = `account/wallets/${operation}`;
  const response = await fetchApi(name, `/api/${name}`, {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    redirect: 'error',
    headers: {
      'Content-Type': 'application/json',
      'X-Hash-Talk-CSRF': session.csrf,
    },
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(8000),
  });
  return readApiJson(response, name);
}
async function bounded<T>(work: () => Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work(),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new Error('The wallet did not complete signing. Try again.'),
            ),
          walletTimeout,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
async function selected(
  wallet: WalletConnection,
  access: boolean,
): Promise<WalletIdentity> {
  const identity = await bounded(() => wallet.identity(access));
  return {
    ecosystem: identity.ecosystem,
    address: canonicalAddress(identity.ecosystem, identity.address),
  };
}
/**
 * Proves possession of the wallet selected in `connection` and adds it. The
 * statement comes from the server but is signed only when it is exactly the
 * statement this client expects for this account, wallet and request.
 */
export async function addSelectedWallet(input: {
  session: AccountSession;
  current: AccountWallet[];
  connection: WalletConnection;
}): Promise<AccountWallet[]> {
  const { session, connection } = input;
  const wallet = await selected(connection, true);
  if (input.current.some((known) => sameWallet(known, wallet)))
    throw new Error(
      "Select the wallet you want to add in your wallet app. It must be different from this account's wallets.",
    );
  const request = walletAdditionRequest(await post('request', session, wallet));
  const expected = walletAdditionStatement({
    origin: applicationOrigin(),
    account: { ecosystem: session.ecosystem, address: session.address },
    wallet,
    id: request.id,
    expiresAt: request.expiresAt,
  });
  if (request.message !== expected)
    throw new Error(
      'The server sent an unexpected request. Nothing was signed.',
    );
  const signature = await bounded(() =>
    connection.sign(request.message, wallet.address),
  );
  if (!sameWallet(await selected(connection, false), wallet))
    throw new Error('The wallet changed during signing. Nothing was added.');
  verifyWalletStatement(wallet, request.message, signature);
  return accountWallets(
    await post('add', session, { id: request.id, signature }),
  );
}

/** The Sign-in wallets card in settings: lists the account's wallets and lets
 * a wallet-confirmed session add or remove the backup wallet. */
export function startAccountWallets(host: AccountWalletHost) {
  let mounted: HTMLElement | null = null;
  let session: AccountSession | null = null;
  let wallets: AccountWallet[] = [];
  let busy = false;
  let message = '';
  let generation = 0;
  /** The add slot lists the wallets this browser detected. */
  let picking = false;
  /** Set while the user is asked to switch wallets inside one extension. */
  let proceed: (() => void) | null = null;

  async function run(work: () => Promise<void>): Promise<void> {
    if (busy || !session) return;
    if (session.walletConfirmed !== true) {
      host.confirmWallet();
      return;
    }
    busy = true;
    message = '';
    const current = ++generation;
    render();
    try {
      await work();
    } catch (error: unknown) {
      if (current === generation)
        message =
          error instanceof Error
            ? translatedError(error.message)
            : t('Could not complete the operation.');
    } finally {
      busy = false;
      render();
    }
  }
  function opensHistory(wallet: WalletIdentity): boolean {
    return host.recovery.wallets().some((known) => sameWallet(known, wallet));
  }
  function opener(): WalletConnection {
    const connection = host.sessionWallet();
    if (!connection)
      throw new Error(
        'The wallet you signed in with was not found in this browser. Open 0xDMme where that wallet is available.',
      );
    return connection;
  }
  async function remove(wallet: AccountWallet): Promise<void> {
    const active = session;
    if (
      !active ||
      !window.confirm(
        t(
          'Remove this backup wallet? It will no longer sign in to this account.',
        ),
      )
    )
      return;
    // Recovery first: the account refuses to drop a wallet that still opens it.
    if (host.recovery.paired())
      await host.withAnotherWallet(() =>
        host.recovery.leavePairs({ sign: signer(), remove: wallet }),
      );
    else if (opensHistory(wallet))
      await host.recovery.remove({ opener: opener(), wallet });
    const remaining = accountWallets(
      await post('remove', active, {
        ecosystem: wallet.ecosystem,
        address: wallet.address,
      }),
    );
    if (session !== active) return;
    wallets = remaining;
    message = t('Backup wallet removed.');
  }
  /** Signs with whichever detected wallet a step needs, asking the user to
   * select it when this browser is showing another one. */
  function signer(): RecoverySigner {
    return detectedWalletSigner({
      connections: () => host.wallets(),
      select: waitForSwitch,
    });
  }
  async function selectedWallet(
    connection: WalletConnection,
  ): Promise<WalletIdentity> {
    const selected = await connection.identity(true);
    return {
      ecosystem: selected.ecosystem,
      address: canonicalAddress(selected.ecosystem, selected.address),
    };
  }
  /** The third wallet changes the rule: from then on two wallets are needed.
   * The user is told and asked before the wallet is registered. */
  async function addThird(
    active: AccountSession,
    connection: WalletConnection,
  ): Promise<void> {
    // Already on the account from an earlier attempt that did not finish.
    const registered = wallets.find(
      (wallet) => !wallet.primary && !opensHistory(wallet),
    );
    if (
      !registered &&
      !window.confirm(
        t(
          'With three wallets, signing in and opening your history will always need two of them. One wallet alone will no longer be enough. Add the third wallet?',
        ),
      )
    )
      return;
    await host.withAnotherWallet(async () => {
      const third = registered ?? (await selectedWallet(connection));
      await host.recovery.enterPairs({
        sign: signer(),
        third,
        register: async () => {
          if (wallets.some((known) => sameWallet(known, third))) return;
          wallets = await addSelectedWallet({
            session: active,
            current: wallets,
            connection,
          });
          render();
        },
      });
    });
    if (session !== active) return;
    message = t(
      'Third wallet added. Signing in and opening your history now need two wallets.',
    );
  }
  /** Both wallets live in one extension: the user switches account between
   * the two signatures, and says when that is done. */
  function waitForSwitch(wallet?: WalletIdentity): Promise<void> {
    return new Promise((resolve) => {
      message = wallet
        ? t('Select wallet {0} in your wallet app, then press Continue.', [
            shortAddress(wallet.address),
          ])
        : t(
            'Now select the wallet you want to add in your wallet app, then press Continue.',
          );
      proceed = () => {
        proceed = null;
        message = '';
        render();
        resolve();
      };
      render();
    });
  }
  /** Adds the wallet selected in a connection, or with `null` finishes a
   * backup wallet that is on the account but does not open history yet. */
  async function add(connectionId: string | null): Promise<void> {
    const active = session;
    const source = opener();
    const connection =
      connectionId === null
        ? source
        : host.wallets().find((candidate) => candidate.id === connectionId);
    if (!active || !connection)
      throw new Error(
        'No wallet detected in this browser. Open 0xDMme in a browser with the wallet you want to add.',
      );
    // A second backup, or a third wallet still without its pairs.
    if (wallets.length >= 2 && (connectionId !== null || wallets.length === 3))
      return addThird(active, connection);
    await host.withAnotherWallet(() =>
      host.recovery.add({
        opener: source,
        backup: connection,
        ...(connection.id === source.id ? { beforeBackup: waitForSwitch } : {}),
        register: async (wallet) => {
          if (wallets.some((known) => sameWallet(known, wallet))) return;
          wallets = await addSelectedWallet({
            session: active,
            current: wallets,
            connection,
          });
          render();
        },
      }),
    );
    if (session !== active) return;
    message = t(
      'Backup wallet added. It can now sign in and open your history.',
    );
  }
  /** A phone without a wallet in this page (always so in the installed app)
   * adds wallets from inside a wallet app's browser instead. */
  const phone = mobilePlatform() !== 'other';
  function openInWallet(wallet: WalletName): void {
    const link = walletPageUrl({
      origin: applicationOrigin(),
      wallet,
      page: walletsPage,
      platform: mobilePlatform(),
    });
    if (!link) {
      message = t(
        'Wallet apps can only open the HTTPS address of 0xDMme, not this local address.',
      );
      render();
      return;
    }
    // The operating system decides whether the wallet app opens.
    location.assign(link);
  }
  async function copy(wallet: AccountWallet): Promise<void> {
    try {
      await navigator.clipboard.writeText(wallet.address);
      showToast(t('Address copied.'));
    } catch {
      showToast(t('Could not copy the address.'));
    }
  }
  function render(): void {
    if (!mounted) return;
    mounted.hidden = !session;
    if (!session) return;
    mounted.replaceChildren(
      walletCard({
        wallets,
        opensHistory,
        detected: host.wallets(),
        walletApps: phone ? walletApps : [],
        busy,
        message,
        picking,
        proceed,
        actions: {
          add: (connectionId) => {
            picking = false;
            void run(() => add(connectionId));
          },
          finish: () => {
            void run(() => add(null));
          },
          remove: (wallet) => {
            void run(() => remove(wallet));
          },
          copy: (wallet) => {
            void copy(wallet);
          },
          openIn: openInWallet,
          pick: (open) => {
            picking = open;
            render();
          },
        },
      }),
    );
  }
  async function load(): Promise<void> {
    const current = ++generation;
    if (!session) {
      wallets = [];
      render();
      return;
    }
    try {
      const latest = accountWallets(await post('list', session, {}));
      if (current !== generation) return;
      wallets = latest;
      message = '';
    } catch {
      if (current !== generation) return;
      message = t('Could not load your wallets. Check your connection.');
    }
    render();
  }
  return {
    mount(container: HTMLElement): void {
      mounted = container;
      render();
      void load();
    },
    /** The session started, changed or ended. */
    setSession(value: AccountSession | null): void {
      session = value;
      wallets = [];
      message = '';
      picking = false;
      if (mounted) void load();
    },
  };
}
