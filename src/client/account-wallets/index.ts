import type { AccountSession } from '../../shared/account/index.ts';
import {
  accountWallets,
  maximumWallets,
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
import type { WalletConnection } from '../wallet/index.ts';

/** What this feature needs from the signed-in account. */
export interface AccountWalletHost {
  /** Wallets detected in this browser. */
  wallets: () => WalletConnection[];
  /** Runs wallet work that may switch the selected wallet account; the switch
   * signs the page out only after the work ends. */
  withAnotherWallet: <T>(work: () => Promise<T>) => Promise<T>;
  confirmWallet: () => void;
}

const walletTimeout = 120_000;

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
function shortAddress(address: string): string {
  return address.length > 14
    ? `${address.slice(0, 6)}…${address.slice(-4)}`
    : address;
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

  function element<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    text = '',
  ): HTMLElementTagNameMap[K] {
    const node = document.createElement(tag);
    node.textContent = text;
    return node;
  }
  function action(label: string, work: () => Promise<void>) {
    const button = element('button', label);
    button.type = 'button';
    button.disabled = busy;
    button.addEventListener('click', () => {
      void run(work);
    });
    return button;
  }
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
  function walletRow(wallet: AccountWallet): HTMLLIElement {
    const item = element('li'),
      label = element(
        'span',
        `${shortAddress(wallet.address)} · ${wallet.ecosystem.toUpperCase()}`,
      ),
      role = element(
        'small',
        wallet.primary ? t('Main wallet') : t('Backup wallet'),
      );
    label.title = wallet.address;
    role.className = 'device-last-used';
    label.append(role);
    item.append(label);
    if (!wallet.primary) item.append(action(t('Remove'), () => remove(wallet)));
    return item;
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
  async function add(connectionId: string): Promise<void> {
    const connection = host
      .wallets()
      .find((candidate) => candidate.id === connectionId);
    const active = session;
    if (!active || !connection)
      throw new Error(
        'No wallet detected in this browser. Open 0xDMme in a browser with the wallet you want to add.',
      );
    const added = await host.withAnotherWallet(() =>
      addSelectedWallet({ session: active, current: wallets, connection }),
    );
    if (session !== active) return;
    wallets = added;
    message = t('Backup wallet added. It can now sign in to this account.');
  }
  function addControls(): HTMLElement | null {
    if (wallets.length >= maximumWallets) return null;
    const row = element('div'),
      label = element('label', t('Wallet to add')),
      select = element('select');
    for (const connection of host.wallets()) {
      const option = element(
        'option',
        `${connection.name} — ${connection.ecosystem.toUpperCase()}`,
      );
      option.value = connection.id;
      select.append(option);
    }
    select.disabled = busy;
    label.append(select);
    row.className = 'account-wallet-add';
    row.append(
      label,
      action(t('Add backup wallet'), () => add(select.value)),
    );
    return row;
  }
  function render(): void {
    if (!mounted) return;
    mounted.hidden = !session;
    if (!session) return;
    const card = element('article'),
      list = element('ul'),
      status = element('p', message),
      controls = addControls();
    card.className = 'card';
    list.className = 'account-wallet-list';
    status.setAttribute('role', 'status');
    list.append(...wallets.map(walletRow));
    card.append(
      element('h2', t('Sign-in wallets')),
      element(
        'p',
        t(
          'Your main wallet is the address other people use to find you. A backup wallet can also sign in to this account. If you lose every wallet, the account cannot be recovered.',
        ),
      ),
      list,
      status,
    );
    if (controls) card.append(controls);
    mounted.replaceChildren(card);
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
      if (mounted) void load();
    },
  };
}
