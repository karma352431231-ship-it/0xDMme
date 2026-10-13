import { t } from '../../shared/i18n/index.ts';
import {
  AccountError,
  accountSession,
  boundedText,
  object,
  uuid,
} from '../../shared/account/index.ts';
import type { AccountSession } from '../../shared/account/index.ts';
import { openingRequest } from '../../shared/wallet-opening/index.ts';
import { canonicalAddress } from '../../shared/wallet-identity/index.ts';
import { signLoginOpening } from '../wallet-opening/index.ts';
import type { discoverWallets } from '../wallet/index.ts';
import type { WalletConnection, WalletName } from '../wallet/index.ts';
import { signWalletStatement } from '../wallet-statements/index.ts';
import type { ApprovalFlow, IncomingRequest } from './approval-flow.ts';
import { api, deviceId } from './core.ts';
import type { AccountCore } from './core.ts';
import type { createWalletReturn } from './wallet-return.ts';

type Wallets = ReturnType<typeof discoverWallets>;
type LoginProof = { id: string; signature: string; currentEpoch: number };

/**
 * Wallet login: the signed challenge, the request signed for another browser,
 * opening the mobile wallet and the provider watch that ends the session when
 * the wallet changes. Statements for organizations use the same wallet.
 */
export class WalletLogin {
  private removeProviderListeners: (() => void) | undefined;
  private providerChanged = false;
  private readonly core: AccountCore;
  private readonly wallets: Wallets;
  private readonly approval: ApprovalFlow;
  private readonly walletReturn: ReturnType<typeof createWalletReturn>;
  private readonly host: {
    render: () => void;
    setSession: (session: AccountSession) => void;
    openAccount: (session: AccountSession) => Promise<void>;
    /** Ends the session when the provider changes outside an operation. */
    logout: () => void;
  };
  constructor(input: {
    core: AccountCore;
    wallets: Wallets;
    approval: ApprovalFlow;
    walletReturn: ReturnType<typeof createWalletReturn>;
    host: WalletLogin['host'];
  }) {
    this.core = input.core;
    this.wallets = input.wallets;
    this.approval = input.approval;
    this.walletReturn = input.walletReturn;
    this.host = input.host;
  }
  async login(name: string): Promise<void> {
    this.rememberLoginWallet(name);
    if (this.approval.only && !this.approval.incoming)
      throw new AccountError(
        400,
        'Pedido ausente. Reinicie pelo navegador original.',
      );
    const request = this.approval.incoming;
    const instance = this.wallets.get(name);
    if (!instance) {
      await this.openMobileWallet(name);
      return;
    }
    this.checkIncoming(instance);
    if (request && this.approval.opening) {
      await this.finishIncomingOpening(instance, request, this.core.epoch);
      return;
    }
    if (!this.approval.incoming && this.walletReturn.state())
      await this.walletReturn.cancel();
    this.core.status = t('Confirme a conexão na {0}.', [instance.name]);
    this.host.render();
    const proof = await this.createLoginProof(instance);
    if (request) {
      await this.signIncoming(instance, request, proof);
      return;
    }
    await this.acceptLoginProof(proof);
  }
  /** Ends the provider watch, at logout or when another request arrives. */
  stopObserving(): void {
    this.removeProviderListeners?.();
    this.removeProviderListeners = undefined;
  }
  /** True once, when the provider changed while an operation was running. */
  takeProviderChange(): boolean {
    const changed = this.providerChanged;
    this.providerChanged = false;
    return changed;
  }
  async signStatement(message: string): Promise<string> {
    const active = this.core.session;
    if (!active || this.core.busy)
      throw new Error('Entre na conta e aguarde a operação atual.');
    const current = () => {
      if (this.core.session?.csrf !== active.csrf)
        throw new Error('Sessão alterada durante a assinatura.');
    };
    this.core.busy = true;
    try {
      const preferred = localStorage.getItem('0xdmme:login-wallet') ?? '';
      const wallet =
        this.wallets.get(
          active.ecosystem === 'solana' ? `${preferred}:solana` : preferred,
        ) ?? this.wallets.list().find((w) => w.ecosystem === active.ecosystem);
      if (!wallet)
        throw new Error(
          'Para assinar organizações e autorizações, abra o 0xDMme no navegador da wallet ou use uma extensão. O retorno dessas assinaturas ao Chrome/Safari ainda está pendente.',
        );
      return await signWalletStatement({
        wallet,
        identity: {
          accountId: active.accountId,
          ecosystem: active.ecosystem,
          address: active.address,
        },
        message,
        current,
      });
    } finally {
      this.core.busy = false;
    }
  }
  private observeProvider(instance: WalletConnection): void {
    this.removeProviderListeners?.();
    const changed = () => {
      this.core.epoch++;
      if (this.core.session) {
        if (this.core.busy) this.providerChanged = true;
        else this.host.logout();
      }
    };
    this.removeProviderListeners = instance.observe(changed);
  }
  private async openMobileWallet(name: string): Promise<void> {
    this.rememberLoginWallet(name);
    if (this.approval.incoming)
      throw new Error(
        'Wallet não disponível neste navegador interno. Abra novamente o pedido no navegador original.',
      );
    const [wallet, network] = name.split(':');
    if (!['MetaMask', 'Phantom', 'Backpack'].includes(wallet ?? ''))
      throw new Error('Wallet não disponível.');
    await this.walletReturn.start(
      wallet as WalletName,
      network === 'solana' ? 'solana' : 'evm',
    );
  }
  private checkIncoming(instance: WalletConnection): void {
    const incoming = this.approval.incoming;
    if (!incoming) return;
    if (
      incoming.ecosystem !== instance.ecosystem ||
      incoming.wallet !== instance.name ||
      this.approval.signed
    )
      throw new Error('Selecione a wallet e o ecossistema do pedido original.');
  }
  private checkEpoch(current: number): void {
    if (current !== this.core.epoch || this.core.disposed)
      throw new Error('Pedido encerrado ou wallet alterada.');
  }
  private async createLoginProof(
    instance: WalletConnection,
  ): Promise<LoginProof> {
    const currentEpoch = ++this.core.epoch;
    this.progress('conexao-solicitada');
    const identity = await instance.identity(true);
    this.checkEpoch(currentEpoch);
    this.checkConfirmationWallet(identity);
    this.approval.step('conexao-recebida');
    this.observeProvider(instance);
    this.progress('desafio-solicitado');
    const incoming = this.approval.incoming;
    const challenge = object(
      await api(incoming ? 'handoff-challenge' : 'challenge', {
        input: incoming
          ? {
              ticket: incoming.ticket,
              address: identity.address,
              chainId: identity.chainId,
            }
          : { ...identity, deviceId: deviceId() },
      }),
    );
    this.checkEpoch(currentEpoch);
    this.approval.step('desafio-recebido');
    this.core.status = t(
      'Confira domínio e endereço na wallet e assine somente o pedido de login.',
    );
    this.host.render();
    this.progress('assinatura-solicitada');
    const signature = await instance.sign(
      boundedText(challenge['message'], 2048),
      identity.address,
    );
    this.checkEpoch(currentEpoch);
    this.approval.step('assinatura-recebida');
    await this.checkStillConnected(instance, identity, currentEpoch);
    this.approval.step('wallet-reconferida');
    return { id: uuid(challenge['id']), signature, currentEpoch };
  }
  private progress(stage: Parameters<ApprovalFlow['step']>[0]): void {
    this.approval.step(stage);
    this.approval.renderDiagnostics();
  }
  private async checkStillConnected(
    instance: WalletConnection,
    identity: Awaited<ReturnType<WalletConnection['identity']>>,
    currentEpoch: number,
  ): Promise<void> {
    const stillConnected = await instance.identity(false);
    this.checkEpoch(currentEpoch);
    if (
      canonicalAddress(identity.ecosystem, stillConnected.address) !==
        canonicalAddress(identity.ecosystem, identity.address) ||
      stillConnected.chainId !== identity.chainId ||
      stillConnected.ecosystem !== identity.ecosystem
    )
      throw new Error('Wallet alterada.');
  }
  private checkConfirmationWallet(identity: {
    ecosystem: AccountSession['ecosystem'];
    address: string;
  }): void {
    const session = this.core.session;
    if (
      this.core.forcePicker &&
      session &&
      (session.ecosystem !== identity.ecosystem ||
        canonicalAddress(identity.ecosystem, identity.address) !==
          session.address)
    )
      throw new Error(
        'Selecione a wallet da conta aberta para confirmar as ações sensíveis.',
      );
  }
  private rememberLoginWallet(name: string): void {
    if (!this.approval.only)
      localStorage.setItem('0xdmme:login-wallet', name.split(':')[0] ?? name);
  }
  private async signIncoming(
    instance: WalletConnection,
    request: NonNullable<IncomingRequest>,
    proof: LoginProof,
  ): Promise<void> {
    this.progress('assinatura-enviada');
    const signed = object(
      await api('handoff-sign', {
        input: {
          ticket: request.ticket,
          id: proof.id,
          signature: proof.signature,
        },
      }),
    );
    this.checkEpoch(proof.currentEpoch);
    this.approval.opening =
      signed['opening'] === undefined
        ? null
        : await openingRequest(signed['opening']);
    await this.finishIncomingOpening(instance, request, proof.currentEpoch);
  }
  private async acceptLoginProof(proof: LoginProof): Promise<void> {
    const authenticated = accountSession(
      await api('login', {
        input: { id: proof.id, signature: proof.signature },
      }),
    );
    if (proof.currentEpoch !== this.core.epoch || this.core.disposed) {
      await api('logout', { input: {}, csrf: authenticated.csrf });
      return;
    }
    this.host.setSession(authenticated);
    this.core.status = t('Abrindo sua conta…');
    await this.host.openAccount(authenticated);
  }
  private async finishIncomingOpening(
    instance: WalletConnection,
    request: NonNullable<IncomingRequest>,
    currentEpoch: number,
  ): Promise<void> {
    const opening = this.approval.opening;
    if (opening) {
      this.core.status = t(
        'Continue nesta wallet para abrir as chaves da sua conta.',
      );
      this.host.render();
      const encrypted = await signLoginOpening({
        request: opening,
        wallet: instance,
        ticket: request.ticket,
        current: () => this.checkEpoch(currentEpoch),
      });
      await api('handoff-opening-submit', { input: encrypted });
    }
    this.checkEpoch(currentEpoch);
    this.approval.confirmed(request.ticket);
    this.core.status = t(
      'Assinatura confirmada. Feche a {0} e volte ao navegador onde iniciou o login para confirmar o endereço.',
      [instance.name],
    );
    this.approval.step('retorno-manual');
    this.host.render();
  }
}
