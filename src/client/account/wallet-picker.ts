import { t } from '../../shared/i18n/index.ts';
import type { discoverWallets } from '../wallet/index.ts';
import { mobileWalletBrowser } from './wallet-return.ts';
import { mountWalletMark } from './wallet-marks.ts';
import { node } from './core.ts';
import type { AccountCore } from './core.ts';

type Wallets = ReturnType<typeof discoverWallets>;
const listedBrands = ['MetaMask', 'Phantom', 'Backpack'];
const listedNetworks = [
  'MetaMask:evm',
  'MetaMask:solana',
  'Phantom:evm',
  'Phantom:solana',
  'Backpack:evm',
  'Backpack:solana',
];

/** The two-step wallet and ecosystem chooser of the account card. */
export class WalletPicker {
  open = false;
  selected: string | null = null;
  private readonly core: AccountCore;
  private readonly wallets: Wallets;
  private readonly host: {
    /** Whether the chooser applies to the current session and page. */
    visible: () => boolean;
    choose: (id: string) => void;
    render: () => void;
  };
  constructor(core: AccountCore, wallets: Wallets, host: WalletPicker['host']) {
    this.core = core;
    this.wallets = wallets;
    this.host = host;
  }
  /** Opens the first step, also used to confirm a wallet or complete sign-in. */
  request(): void {
    this.core.forcePicker = true;
    this.open = true;
    this.selected = null;
  }
  mount(container: HTMLElement): void {
    container
      .querySelectorAll<HTMLButtonElement>('[data-wallet]')
      .forEach((button) => this.bindWallet(button));
    container
      .querySelectorAll<HTMLButtonElement>('[data-wallet-brand]')
      .forEach((button) => this.bindBrand(button));
    this.renderWallets();
    this.find('[data-wallet-picker-toggle]')?.addEventListener('click', () =>
      this.toggle(),
    );
    this.find('[data-wallet-picker-back]')?.addEventListener('click', () =>
      this.back(),
    );
    container.addEventListener('keydown', (event) => this.escape(event));
  }
  renderWallets(): void {
    this.renderDetection();
    this.renderBrands();
    const other = this.find('[data-other-wallets]');
    const networks = this.find('[data-other-wallet-networks]');
    if (!other || !networks) return;
    other.replaceChildren();
    networks.replaceChildren();
    const brands = new Set(listedBrands);
    const listed = new Set(listedNetworks);
    for (const wallet of this.wallets.list()) {
      if (!brands.has(wallet.name)) {
        brands.add(wallet.name);
        other.append(this.otherBrand(wallet.name));
      }
      const network = `${wallet.name}:${wallet.ecosystem}`;
      if (wallet.name !== this.selected || listed.has(network)) continue;
      listed.add(network);
      const button = option(wallet.ecosystem === 'evm' ? 'EVM' : 'Solana');
      button.dataset['wallet'] = wallet.id;
      networks.append(button);
      this.bindWallet(button);
    }
  }
  render(): void {
    const trigger = this.find<HTMLButtonElement>('[data-wallet-picker-toggle]');
    const panel = this.find('[data-wallet-picker]');
    const visible = this.host.visible();
    if (trigger) {
      trigger.hidden = !visible;
      trigger.setAttribute('aria-expanded', String(this.open && visible));
    }
    if (panel) panel.hidden = !this.open || !visible;
    const brands = this.find('[data-wallet-brands]');
    const networks = this.find('[data-wallet-networks]');
    const title = this.find('[data-wallet-network-title]');
    if (brands) brands.hidden = this.selected !== null;
    if (networks) networks.hidden = this.selected === null;
    if (title) title.textContent = this.selected ?? '';
  }
  private find<T extends HTMLElement>(selector: string): T | null {
    return node<T>(this.core, selector);
  }
  private otherBrand(name: string): HTMLButtonElement {
    const brand = option(name);
    brand.dataset['walletBrand'] = name;
    this.bindBrand(brand);
    return brand;
  }
  private bindWallet(button: HTMLButtonElement): void {
    button.addEventListener('click', () => {
      const id = button.dataset['wallet'];
      if (!id || this.core.busy) return;
      this.open = false;
      this.find<HTMLButtonElement>('[data-wallet-picker-toggle]')?.focus();
      this.host.choose(id);
    });
  }
  private bindBrand(button: HTMLButtonElement): void {
    mountWalletMark(button);
    button.addEventListener('click', () => {
      if (this.core.busy) return;
      this.selected = button.dataset['walletBrand'] ?? null;
      this.renderWallets();
      this.host.render();
      this.find<HTMLButtonElement>('[data-wallet]:not([hidden])')?.focus();
    });
  }
  private renderBrands(): void {
    this.core.mounted
      ?.querySelectorAll<HTMLElement>('[data-brand-detection]')
      .forEach((indicator) => {
        const brand = indicator.dataset['brandDetection'];
        const detected =
          brand !== undefined &&
          (this.wallets.get(brand) !== undefined ||
            this.wallets.get(`${brand}:solana`) !== undefined);
        indicator.textContent = detectionLabel(detected);
        indicator.classList.toggle('is-detected', detected);
      });
    this.core.mounted
      ?.querySelectorAll<HTMLButtonElement>('[data-network-brand]')
      .forEach((button) => {
        button.hidden = button.dataset['networkBrand'] !== this.selected;
      });
  }
  private renderDetection(): void {
    this.core.mounted
      ?.querySelectorAll<HTMLElement>('[data-detection]')
      .forEach((indicator) => {
        const id = indicator.dataset['detection'];
        const detected = id !== undefined && this.wallets.get(id) !== undefined;
        indicator.textContent = detectionLabel(detected);
        indicator.classList.toggle('is-detected', detected);
      });
  }
  private back(): void {
    this.selected = null;
    this.renderWallets();
    this.host.render();
    this.find<HTMLButtonElement>('[data-wallet-brand]')?.focus();
  }
  private toggle(): void {
    if (this.core.busy) return;
    this.open = !this.open;
    this.selected = null;
    this.renderWallets();
    this.host.render();
    if (this.open) this.find<HTMLButtonElement>('[data-wallet-brand]')?.focus();
  }
  private escape(event: KeyboardEvent): void {
    if (event.key !== 'Escape' || !this.open) return;
    event.preventDefault();
    if (this.selected !== null) {
      this.back();
      return;
    }
    this.open = false;
    this.host.render();
    this.find<HTMLButtonElement>('[data-wallet-picker-toggle]')?.focus();
  }
}

function option(labelText: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'wallet-option';
  const label = document.createElement('span');
  label.textContent = labelText;
  const indicator = document.createElement('span');
  indicator.className = 'wallet-detection is-detected';
  indicator.textContent = t('Detected');
  button.append(label, indicator);
  return button;
}

function detectionLabel(detected: boolean): string {
  if (detected) return t('wallet.available');
  return mobileWalletBrowser() ? t('Open in app') : t('wallet.not-detected');
}
