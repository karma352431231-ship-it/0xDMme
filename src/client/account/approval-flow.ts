import { AccountError } from '../../shared/account/index.ts';
import {
  approvalDocumentUrl,
  approvalEntryUrl,
} from '../../shared/wallet-approval/index.ts';
import type { OpeningRequest } from '../../shared/wallet-opening/index.ts';
import { SolanaConnectionError } from '../wallet/index.ts';
import { createApprovalDiagnostics } from './approval-diagnostics.ts';
import type { ApprovalStage } from './approval-diagnostics.ts';
import { takeApprovalDocument } from './approval-document.ts';
import { api, node } from './core.ts';
import type { AccountCore } from './core.ts';
import { createPendingApproval } from './pending-approval.ts';
import { serverApproval } from './server-approval.ts';
import { incomingWalletRequest } from './wallet-return.ts';

export type IncomingRequest = ReturnType<typeof incomingWalletRequest>;
const longestOperation = 300_000;

/**
 * A login request started in another browser and signed here (wallet browser
 * or approval page): reading it from the fragment, document or cookie, its
 * deadline, diagnostics and the confirmation text. It never creates a session.
 */
export class ApprovalFlow {
  /** The standalone approval document, without the app's panels. */
  readonly page: boolean;
  /** This view only signs a request; it does not open the account. */
  only: boolean;
  incoming: IncomingRequest;
  signed = false;
  opening: OpeningRequest | null = null;
  readonly diagnostics = createApprovalDiagnostics();
  readonly pending = createPendingApproval(() => this.expire());
  private documentPending: boolean;
  private cookieEligible: boolean;
  private documentRemaining: number | undefined;
  private expiryTimer: number | undefined;
  private deadline: number | undefined;
  private readonly core: AccountCore;
  private readonly host: {
    render: () => void;
    walletAvailable: (id: string) => boolean;
    openingDiagnostic: () => string | null;
    /** Drops the private profile, provider listeners and session. */
    reset: () => void;
  };
  constructor(core: AccountCore, host: ApprovalFlow['host']) {
    this.core = core;
    this.host = host;
    const documentApproval =
      approvalEntryUrl(location.pathname) ||
      approvalDocumentUrl(location.pathname);
    this.documentPending = documentApproval;
    this.page = documentApproval || location.pathname === '/wallet.html';
    this.cookieEligible =
      this.page &&
      !documentApproval &&
      (!location.hash || location.hash === '#configuracoes');
    this.only =
      this.page || (location.hash ?? '').startsWith('#configuracoes?');
    // Reading the request also sets the remaining time of a document request.
    this.incoming = this.read();
    if (this.documentRemaining !== undefined) {
      this.expiryTimer = window.setTimeout(
        () => this.expire(),
        this.documentRemaining,
      );
      this.deadline = Date.now() + this.documentRemaining;
    }
  }
  step(stage: ApprovalStage): void {
    if (this.only) this.diagnostics.step(stage);
  }
  walletId(): string {
    if (!this.incoming) return '';
    return this.incoming.ecosystem === 'solana'
      ? `${this.incoming.wallet}:solana`
      : this.incoming.wallet;
  }
  /** Wallet prompts get until the request deadline; ordinary logins 90 s. */
  operationTimeout(): number {
    if (!this.incoming) return 90_000;
    return Math.max(
      0,
      Math.min(
        longestOperation,
        (this.deadline ?? Date.now() + longestOperation) - Date.now(),
      ),
    );
  }
  reportFailure(error: unknown, request: IncomingRequest): void {
    if (!this.only || this.incoming !== request) return;
    this.diagnostics.fail(
      error instanceof AccountError
        ? error.status
        : error instanceof SolanaConnectionError
          ? error
          : undefined,
    );
  }
  /** The wallet accepted the signature for this request. */
  confirmed(ticket: string): void {
    this.pending.clear(ticket);
    this.signed = true;
    this.step('assinatura-confirmada');
  }
  render(): void {
    this.renderPurpose();
    this.renderApproval();
    this.renderDiagnostics();
  }
  renderDiagnostics(): void {
    const opening = this.only ? null : this.host.openingDiagnostic();
    const panel = this.find('[data-wallet-diagnostics]');
    if (panel) panel.hidden = (!this.only && !opening) || this.signed;
    const detail = this.find('[data-wallet-diagnostic]');
    if (detail)
      detail.textContent =
        opening ??
        this.diagnostics.text(
          this.incoming ? this.host.walletAvailable(this.walletId()) : null,
          this.pending.availability(),
        );
  }
  /** A new `#configuracoes?` fragment replaces whatever this tab was doing. */
  receive(): void {
    if (!location.hash.startsWith('#configuracoes?')) return;
    this.only = true;
    this.cookieEligible = false;
    window.clearTimeout(this.expiryTimer);
    this.deadline = undefined;
    this.core.epoch++;
    this.signed = false;
    this.opening = null;
    this.host.reset();
    this.diagnostics.beginFragment();
    this.incoming = this.read();
    this.core.status = this.incoming
      ? 'Confirme a assinatura do pedido iniciado no seu navegador.'
      : 'Pedido inválido. Volte ao navegador e crie um novo pedido.';
    this.host.render();
  }
  async restore(): Promise<void> {
    if (this.cookieEligible && !(await this.restoreCookie())) return;
    this.core.status = this.incoming
      ? 'Confirme a assinatura para concluir o login no navegador que iniciou o pedido. Recuse pedidos recebidos de terceiros.'
      : 'Pedido ausente ou perdido. Volte ao navegador original e crie um novo pedido.';
  }
  checkDeadline(): void {
    if (this.deadline !== undefined && Date.now() >= this.deadline)
      this.expire();
  }
  close(): void {
    window.clearTimeout(this.expiryTimer);
    this.pending.close();
  }
  private find<T extends HTMLElement>(selector: string): T | null {
    return node<T>(this.core, selector);
  }
  private read(): IncomingRequest {
    if (this.documentPending) {
      this.documentPending = false;
      return this.readDocument();
    }
    try {
      const result = incomingWalletRequest((request) => {
        if (this.page) this.pending.remember(request);
      });
      if (!result) return this.restoreStored();
      this.step('pedido-lido');
      return result;
    } catch {
      this.pending.clear();
      this.step(
        location.hash.startsWith('#configuracoes?')
          ? 'limpeza-url-falhou'
          : 'pedido-invalido',
      );
      // A malformed new request must never recover another stored request.
      return null;
    }
  }
  private readDocument(): IncomingRequest {
    try {
      const state = takeApprovalDocument((received) => {
        this.documentRemaining = received.remaining;
        this.pending.remember(received.request);
      });
      this.step('pedido-lido');
      return state.request;
    } catch {
      this.pending.clear();
      this.step('pedido-invalido');
      return null;
    }
  }
  private restoreStored(): IncomingRequest {
    const eligible =
      this.page && (!location.hash || location.hash === '#configuracoes');
    const result = eligible ? this.pending.restore() : null;
    this.step(result ? 'pedido-restaurado' : 'pedido-ausente');
    return result;
  }
  private expire(): void {
    if (!this.incoming || this.signed) return;
    this.core.epoch++;
    window.clearTimeout(this.expiryTimer);
    this.deadline = undefined;
    this.incoming = null;
    this.step('pedido-expirado');
    this.core.status =
      'Pedido expirou. Volte ao navegador original e inicie um novo pedido.';
    this.host.render();
  }
  private async restoreCookie(): Promise<boolean> {
    const current = this.core.epoch;
    const legacy = this.incoming;
    this.incoming = null;
    this.step('pedido-cookie-solicitado');
    this.core.status = 'Recuperando o pedido iniciado no seu navegador…';
    this.host.render();
    let state;
    try {
      state = serverApproval(await api('approval-request'));
    } catch (error: unknown) {
      if (this.core.disposed || current !== this.core.epoch) return false;
      this.pending.clear();
      throw error;
    }
    if (this.core.disposed || current !== this.core.epoch) return false;
    if (!state) {
      this.incoming = legacy;
      this.step(this.incoming ? 'pedido-restaurado' : 'pedido-ausente');
      return true;
    }
    this.pending.clear();
    this.incoming = state.request;
    this.deadline = Date.now() + state.remaining;
    this.expiryTimer = window.setTimeout(() => this.expire(), state.remaining);
    this.step('pedido-cookie-recebido');
    return true;
  }
  private renderPurpose(): void {
    const purpose = this.find('[data-wallet-purpose]');
    if (purpose) purpose.hidden = !this.incoming || this.signed;
    const manual = this.find('[data-wallet-manual]');
    if (manual) manual.hidden = !this.only || this.signed;
  }
  private renderApproval(): void {
    if (!this.only) return;
    const title = this.find('[data-account-title]');
    if (title) title.textContent = 'Confirme o login no seu navegador';
    const intro = this.find('[data-account-intro]');
    if (intro) {
      intro.hidden = this.signed;
      intro.textContent = this.description();
    }
    const approve = this.find<HTMLButtonElement>('[data-wallet-approve]');
    if (!approve) return;
    approve.hidden = !this.incoming || this.signed;
    approve.textContent = `Confirmar assinatura na ${this.incoming?.wallet ?? 'wallet'}`;
    approve.disabled =
      this.core.busy || !this.host.walletAvailable(this.walletId());
  }
  private description(): string {
    return this.incoming
      ? `${this.incoming.wallet} · ${this.incoming.ecosystem === 'solana' ? 'Solana' : 'EVM'}. Confirme somente o pedido que você iniciou. A wallet pedirá assinaturas para entrar e abrir seus dados cifrados no navegador original. Não há transação ou autorização de tokens.`
      : (this.diagnostics.rejectionMessage() ??
          'Pedido ausente ou perdido. Volte à aba que iniciou o login e crie um novo pedido.');
  }
}
