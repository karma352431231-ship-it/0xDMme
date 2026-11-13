import { t } from '../../shared/i18n/index.ts';
import { walletContactFromAddress } from '../../shared/contacts/index.ts';
import type { WalletContact } from '../../shared/contacts/index.ts';
import { shortAddress } from '../appearance/index.ts';
import { menuIcon } from '../menu-icons/index.ts';

/**
 * Field conveniences of the Add contact dialog: Paste buttons and the wallet
 * preview. Everything here stays on the device; the preview only checks the
 * typed format and never asks the server who owns the wallet.
 */
export function bindEditorFields(
  root: HTMLElement,
  failed: (message: string) => void,
): void {
  root
    .querySelectorAll<HTMLButtonElement>('[data-contact-paste]')
    .forEach((button) =>
      button.addEventListener('click', () => {
        void paste(button, failed);
      }),
    );
  root
    .querySelector<HTMLInputElement>('[data-book-address]')
    ?.addEventListener('input', () => renderWalletPreview(root));
}

async function paste(
  button: HTMLButtonElement,
  failed: (message: string) => void,
): Promise<void> {
  const input = button
    .closest('.contact-field')
    ?.querySelector<HTMLInputElement>('input');
  if (!input) return;
  let text: string;
  try {
    text = (await navigator.clipboard.readText()).trim();
  } catch {
    // Clipboard reads need a permission some browsers and WebViews refuse;
    // typing or the system paste still work, so say so instead of failing.
    failed(t('Paste is not available here. Paste into the field instead.'));
    return;
  }
  input.value = input.maxLength > 0 ? text.slice(0, input.maxLength) : text;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.focus();
}

function typedWallet(value: string): WalletContact | null {
  try {
    return walletContactFromAddress(value);
  } catch {
    // An incomplete or mistyped address is an expected state while typing.
    return null;
  }
}

function previewIdentity(wallet: WalletContact): Element[] {
  const avatar = document.createElement('span'),
    details = document.createElement('span'),
    title = document.createElement('span'),
    address = document.createElement('strong'),
    network = document.createElement('small'),
    note = document.createElement('small'),
    // The circled check glyph; its menu name refers to unblocking.
    check = menuIcon('unblock');
  avatar.className = 'contact-wallet-avatar';
  avatar.setAttribute('aria-hidden', 'true');
  avatar.textContent = (
    wallet.ecosystem === 'evm'
      ? wallet.address.slice(2, 4)
      : wallet.address.slice(0, 2)
  ).toLowerCase();
  details.className = 'contact-wallet-details';
  title.className = 'contact-wallet-title';
  address.textContent = shortAddress(wallet.address);
  network.className = 'contact-wallet-network';
  network.textContent = wallet.ecosystem === 'evm' ? 'EVM' : 'Solana';
  title.append(address, network);
  note.textContent = t('Format checked on this device');
  details.append(title, note);
  check.classList.add('contact-wallet-check');
  return [avatar, details, check];
}

/** Redraws the preview from the address field; call after programmatic fills. */
export function renderWalletPreview(root: ParentNode): void {
  const input = root.querySelector<HTMLInputElement>('[data-book-address]'),
    host = root.querySelector<HTMLElement>('[data-contact-wallet-preview]');
  if (!input || !host) return;
  const typed = input.value.trim();
  const wallet = typed ? typedWallet(typed) : null;
  // A short fragment is still being typed; only a longer one earns a hint.
  host.hidden = !wallet && typed.length < 10;
  host.classList.toggle('invalid', !wallet);
  if (host.hidden) {
    host.replaceChildren();
    return;
  }
  if (wallet) host.replaceChildren(...previewIdentity(wallet));
  else host.textContent = t('This is not a full EVM or Solana address.');
}
