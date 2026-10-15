import { t } from '../../shared/i18n/index.ts';
import type { AccountSession } from '../../shared/account/index.ts';
import { shortAddress } from '../appearance/index.ts';
import type { ApprovalFlow } from './approval-flow.ts';
import { node } from './core.ts';
import type { AccountCore } from './core.ts';
import type { AccountPrivateProfile } from './private-profile.ts';
import type { WalletPicker } from './wallet-picker.ts';
import type { createWalletReturn } from './wallet-return.ts';
import { syncPing } from '../ping/index.ts';

/** Paints the account card and the sidebar from the account's current state. */
export class AccountView {
  private readonly core: AccountCore;
  private readonly picker: WalletPicker;
  private readonly approval: ApprovalFlow;
  private readonly profile: AccountPrivateProfile;
  private readonly walletReturn: ReturnType<typeof createWalletReturn>;
  constructor(input: {
    core: AccountCore;
    picker: WalletPicker;
    approval: ApprovalFlow;
    profile: AccountPrivateProfile;
    walletReturn: ReturnType<typeof createWalletReturn>;
  }) {
    this.core = input.core;
    this.picker = input.picker;
    this.approval = input.approval;
    this.profile = input.profile;
    this.walletReturn = input.walletReturn;
  }
  render(): void {
    this.renderSidebar();
    const { core } = this;
    const mounted = core.mounted;
    if (core.disposed || !mounted) return;
    mounted.hidden =
      core.mountMode === 'login' &&
      core.session !== null &&
      !this.walletReturn.state();
    const message = this.find('[data-account-status]');
    if (message) message.textContent = core.status;
    const profileMessage = this.find('[data-profile-status]');
    if (profileMessage) profileMessage.textContent = core.profileStatus;
    mounted.querySelectorAll<HTMLButtonElement>('button').forEach((button) => {
      button.disabled = core.busy;
    });
    mounted.querySelectorAll<HTMLInputElement>('input').forEach((input) => {
      input.disabled = core.busy;
    });
    this.picker.render();
    this.renderReturn();
    this.approval.render();
    this.renderPanels();
    this.renderGreeting();
    if (!core.session) {
      this.clearForm();
      return;
    }
    this.renderIdentity(core.session);
    this.profile.renderForm(core.session);
  }
  renderSidebar(): void {
    const { session } = this.core;
    const label = document.getElementById('account-label');
    if (label)
      label.textContent =
        session?.name || (session ? t('Minha conta') : t('Entrar na conta'));
    const wallet = document.getElementById('account-wallet');
    if (wallet)
      wallet.textContent = session
        ? `${session.address.slice(0, 6)}…${session.address.slice(-4)}`
        : t('Login por wallet ou vinculação');
    const copy = document.getElementById('copy-wallet');
    if (copy) copy.hidden = !session;
    const feedback = document.getElementById('account-profile-feedback');
    if (feedback)
      feedback.textContent = this.core.busy ? t('Aguarde…') : this.core.status;
    this.profile.renderPhoto();
  }
  bindSidebar(): void {
    document.getElementById('account-avatar')?.addEventListener('click', () => {
      if (!this.core.session || !this.profile.loaded) {
        location.hash = '#settings';
        return;
      }
      document.getElementById('account-photo')?.click();
    });
    document.getElementById('account-photo')?.addEventListener('change', () => {
      void this.profile.selectPhoto();
    });
    document
      .getElementById('copy-wallet')
      ?.addEventListener('click', () => this.copyWallet());
  }
  copyWallet(): void {
    const { session } = this.core;
    if (!session) return;
    void navigator.clipboard
      .writeText(session.address)
      .then(() => {
        this.core.status = this.core.profileStatus = t('Wallet copiada.');
        this.render();
      })
      .catch(() => {
        this.core.status = this.core.profileStatus = t(
          'Não foi possível copiar a wallet.',
        );
        this.render();
      });
  }
  /** Signed out, Ping greets; while the account opens, it types. */
  private renderGreeting(): void {
    const card = this.find('.account-card');
    if (!card) return;
    const mood = this.core.session ? null : this.core.busy ? 'typing' : 'hello';
    syncPing(card, mood);
  }
  private find<T extends HTMLElement>(selector: string): T | null {
    return node<T>(this.core, selector);
  }
  private renderReturn(): void {
    const pending = this.walletReturn.state();
    const panel = this.find('[data-wallet-return]');
    if (panel) panel.hidden = !pending || this.approval.only;
    const open = this.find<HTMLAnchorElement>('[data-wallet-open]');
    const link = this.walletReturn.link();
    if (open) {
      open.hidden = !link;
      if (link) open.href = link;
      else open.removeAttribute('href');
    }
    const candidate = this.find('[data-wallet-candidate]');
    if (candidate)
      candidate.textContent = pending?.address
        ? t(
            'Endereço verificado ({0}): {1}. Confirme somente se é a conta que você escolheu.',
            [pending.ecosystem, pending.address],
          )
        : t(
            'Aguardando assinatura na wallet. Volte ao navegador que abriu o pedido.',
          );
    const confirm = this.find<HTMLButtonElement>('[data-wallet-confirm]');
    if (confirm) confirm.hidden = !pending?.address;
  }
  private renderPanels(): void {
    const { session } = this.core;
    this.core.mounted?.setAttribute(
      'data-connected',
      String(!!session && !this.approval.only && !this.walletReturn.state()),
    );
    const panel = this.find('[data-profile]');
    if (panel) panel.hidden = !session;
    const privatePanel = this.find('[data-private-profile]');
    if (privatePanel) privatePanel.hidden = !this.profile.loaded;
    const finish = this.find('[data-account-finish]');
    if (finish)
      finish.hidden = !session || this.profile.loaded || this.approval.only;
  }
  private clearForm(): void {
    this.core.mounted
      ?.querySelectorAll<HTMLInputElement>('input')
      .forEach((input) => {
        input.value = '';
        input.checked = false;
      });
    this.find<HTMLImageElement>('[data-photo-preview]')?.removeAttribute('src');
    const address = this.find('[data-account-address]');
    if (address) {
      address.textContent = '';
      address.removeAttribute('title');
    }
    const identity = this.find('[data-account-id]');
    if (identity) identity.textContent = '';
    const name = this.find('[data-profile-name]');
    if (name) name.textContent = '';
  }
  private renderIdentity(current: AccountSession): void {
    const label = this.find('[data-profile-name]');
    if (label) label.textContent = current.name || t('Minha conta');
    const address = this.find('[data-account-address]');
    if (address) {
      // Short form on screen; the full address stays in the title and in Copiar.
      const network = current.ecosystem === 'evm' ? 'EVM' : 'Solana';
      address.textContent = t('{0} · {1}', [
        network,
        shortAddress(current.address),
      ]);
      address.title = t('Wallet {0}: {1}', [network, current.address]);
    }
    const identity = this.find('[data-account-id]');
    if (identity) identity.textContent = t('Conta: {0}', [current.accountId]);
  }
}
