import type { AccountWallet } from '../../shared/account-wallets/index.ts';
import { maximumWallets } from '../../shared/account-wallets/index.ts';
import { t } from '../../shared/i18n/index.ts';
import type { WalletConnection } from '../wallet/index.ts';
import {
  settingTip,
  settingsGlyph,
  settingsGlyphElement,
} from '../settings-ui/index.ts';
import type { SettingsGlyph } from '../settings-ui/index.ts';

/** What the Sign-in wallets group shows; the workflow lives in index.ts. */
export interface WalletCardInput {
  wallets: AccountWallet[];
  opensHistory: (wallet: AccountWallet) => boolean;
  detected: WalletConnection[];
  busy: boolean;
  message: string;
  /** The list of detected wallets is open in the add slot. */
  picking: boolean;
  proceed: (() => void) | null;
  actions: {
    add: (connectionId: string) => void;
    finish: () => void;
    remove: (wallet: AccountWallet) => void;
    copy: (wallet: AccountWallet) => void;
    pick: (open: boolean) => void;
  };
}

export function shortAddress(address: string): string {
  return address.length > 14
    ? `${address.slice(0, 6)}…${address.slice(-4)}`
    : address;
}

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = '',
  text = '',
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function button(input: {
  label: string;
  className: string;
  busy: boolean;
  icon?: SettingsGlyph;
  iconOnly?: boolean;
  click: () => void;
}): HTMLButtonElement {
  const node = element('button', `set-btn ${input.className}`);
  node.type = 'button';
  node.disabled = input.busy;
  if (input.icon) node.append(settingsGlyphElement(input.icon));
  if (input.iconOnly) node.setAttribute('aria-label', input.label);
  else node.append(input.label);
  node.addEventListener('click', input.click);
  return node;
}

/** A stable colour turn per address, applied to the brand gradient. */
function avatarTurn(address: string): string {
  let hash = 0;
  for (const character of address)
    hash = (hash * 31 + character.charCodeAt(0)) % 360;
  return `${hash}deg`;
}

function walletRow(input: WalletCardInput, wallet: AccountWallet): HTMLElement {
  const row = element('div', 'set-row wallet-row'),
    avatar = element('span', 'wallet-avatar'),
    text = element('span', 'set-text'),
    line = element('span', 'wallet-line'),
    address = element('span', 'wallet-address', shortAddress(wallet.address)),
    role = element(
      'span',
      wallet.primary ? 'set-chip set-accent' : 'set-chip',
      wallet.primary ? t('Main') : t('Backup'),
    ),
    ecosystem = element('span', 'set-chip', wallet.ecosystem.toUpperCase()),
    finished = wallet.primary || input.opensHistory(wallet),
    meta = element(
      'span',
      'set-meta',
      wallet.primary
        ? t('Signs in · how people find you')
        : finished
          ? t('Signs in and opens your history')
          : t('Does not open your history yet'),
    );
  avatar.setAttribute('aria-hidden', 'true');
  avatar.style.setProperty('--wallet-turn', avatarTurn(wallet.address));
  address.title = wallet.address;
  line.append(address, role, ecosystem);
  text.append(line, meta);
  row.append(avatar, text, element('span', 'set-fill'));
  row.append(
    button({
      label: t('Copy address'),
      className: 'set-quiet set-icon',
      busy: false,
      icon: 'copy',
      iconOnly: true,
      click: () => input.actions.copy(wallet),
    }),
  );
  if (wallet.primary) return row;
  if (!finished)
    row.append(
      button({
        label: t('Finish setup'),
        className: 'set-primary',
        busy: input.busy,
        click: input.actions.finish,
      }),
    );
  row.append(
    button({
      label: t('Remove'),
      className: 'set-quiet set-danger',
      busy: input.busy,
      click: () => input.actions.remove(wallet),
    }),
  );
  return row;
}

/** The empty slot: one button, then the wallets this browser detected. */
function addSlot(input: WalletCardInput): HTMLElement | null {
  if (input.wallets.length >= maximumWallets) return null;
  const third = input.wallets.length >= 2;
  const slot = element('div', 'wallet-slot'),
    row = element('div', 'set-row'),
    tile = element('span', 'wallet-avatar wallet-avatar-empty'),
    text = element('span', 'set-text');
  tile.append(settingsGlyphElement('plus'));
  text.append(
    element(
      'span',
      'set-label',
      third ? t('Third wallet') : t('Backup wallet'),
    ),
    element(
      'span',
      'set-meta',
      third
        ? t('With three wallets, two are needed to sign in')
        : t('A second wallet that can also sign in'),
    ),
  );
  row.append(tile, text, element('span', 'set-fill'));
  row.append(
    button({
      label: input.picking ? t('Cancel') : t('Add wallet'),
      className: input.picking ? 'set-quiet' : 'set-primary',
      busy: input.busy,
      ...(input.picking ? {} : { icon: 'plus' as const }),
      click: () => input.actions.pick(!input.picking),
    }),
  );
  slot.append(row);
  if (!input.picking) return slot;
  const list = element('div', 'wallet-choices');
  list.setAttribute('role', 'group');
  list.setAttribute('aria-label', t('Choose the wallet to add'));
  if (!input.detected.length)
    list.append(
      element(
        'p',
        'set-status',
        t(
          'No wallet detected in this browser. Open 0xDMme in a browser with the wallet you want to add.',
        ),
      ),
    );
  for (const connection of input.detected)
    list.append(
      button({
        label: `${connection.name} · ${connection.ecosystem.toUpperCase()}`,
        className: 'wallet-choice',
        busy: input.busy,
        icon: 'wallet',
        click: () => input.actions.add(connection.id),
      }),
    );
  slot.append(list);
  return slot;
}

/** The Sign-in wallets group of Privacy and Security. */
export function walletCard(input: WalletCardInput): HTMLElement {
  const group = element('section', 'set-group account-wallets'),
    title = element('h3', 'set-group-title'),
    card = element('div', 'set-card'),
    status = element('p', 'set-status', input.message);
  title.innerHTML = `<span></span>${settingTip(
    t('Sign-in wallets'),
    t(
      'Your main wallet is the address other people use to find you. A backup wallet can also sign in to this account. If you lose every wallet, the account cannot be recovered.',
    ),
  )}<span class="set-fill"></span>`;
  title.firstElementChild!.textContent = t('Sign-in wallets');
  if (input.wallets.length === 1) {
    const warning = element('span', 'set-chip set-warn');
    warning.innerHTML = settingsGlyph('warning');
    warning.append(t('No backup wallet'));
    title.append(warning);
  }
  card.append(...input.wallets.map((wallet) => walletRow(input, wallet)));
  const slot = addSlot(input);
  if (slot) card.append(slot);
  status.setAttribute('role', 'status');
  group.append(title, card, status);
  if (input.proceed)
    group.append(
      button({
        label: t('Continue'),
        className: 'set-primary wallet-continue',
        busy: false,
        click: input.proceed,
      }),
    );
  return group;
}
