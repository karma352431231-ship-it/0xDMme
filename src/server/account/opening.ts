import { randomBytes, randomUUID } from 'node:crypto';
import { AccountError, keys, object } from '../../shared/account/index.ts';
import type { AccountSession } from '../../shared/account/index.ts';
import { canonical, digest, sealedSecret } from '../../shared/devices/index.ts';
import type { SealedSecret } from '../../shared/devices/index.ts';
import {
  openingReceiver,
  openingTicket,
} from '../../shared/wallet-opening/index.ts';
import type {
  OpeningReceiver,
  OpeningRequest,
} from '../../shared/wallet-opening/index.ts';
import {
  recoveryIdentity,
  recoveryTransfer,
} from '../../shared/wallet-recovery/index.ts';
import type { WalletRecovery } from '../../shared/wallet-recovery/index.ts';

type Identity = Pick<AccountSession, 'accountId' | 'address' | 'ecosystem'>;
interface Pending {
  browser: string;
  receiver: OpeningReceiver;
  expires: number;
  request: OpeningRequest | null;
  envelope: SealedSecret | null;
  session: Pick<AccountSession, 'accountId' | 'deviceId' | 'csrf'> | null;
}
/** Public metadata and ciphertext only; confirmation still belongs to the
 * original browser. Restart/expiry cancels unfinished entries, never vault data. */
export class LoginOpening {
  private readonly pending = new Map<string, Pending>();
  private readonly origin: string;
  constructor(origin: string) {
    this.origin = origin;
  }
  private prune(): void {
    for (const [ticket, state] of this.pending)
      if (state.expires <= Date.now()) this.pending.delete(ticket);
  }
  async start(
    browser: string,
    input: unknown,
    expires: number,
  ): Promise<string> {
    const receiver = openingReceiver(input);
    const key = await crypto.subtle.importKey(
      'spki',
      Uint8Array.from(Buffer.from(receiver.receiver, 'base64')),
      { name: 'RSA-OAEP', hash: 'SHA-256' },
      false,
      ['encrypt'],
    );
    if ((key.algorithm as RsaHashedKeyAlgorithm).modulusLength !== 3072)
      throw new AccountError(400, 'Destino de abertura inválido.');
    const ticket = await openingTicket(receiver);
    this.prune();
    if (this.pending.has(ticket) || this.pending.size >= 128)
      throw new AccountError(429, 'Muitas entradas pendentes. Aguarde.');
    this.pending.set(ticket, {
      browser,
      receiver,
      expires,
      request: null,
      envelope: null,
      session: null,
    });
    return ticket;
  }
  prepare(ticket: string, identity: Identity, saved: WalletRecovery | null) {
    const state = this.find(ticket);
    if (!state) return null;
    const config = saved ?? {
      version: 1 as const,
      accountId: identity.accountId,
      ecosystem: identity.ecosystem,
      address: identity.address,
      origin: this.origin,
      id: randomUUID(),
      salt: randomBytes(32).toString('base64'),
    };
    recoveryIdentity(config, identity, this.origin);
    state.request = {
      transfer: recoveryTransfer({
        version: 1,
        ticket,
        wallet: state.receiver.wallet,
        receiver: state.receiver.receiver,
        config,
        count: saved ? 1 : 2,
      }),
      nonce: state.receiver.nonce,
    };
    return state.request;
  }
  private find(ticket: string): Pending | undefined {
    this.prune();
    return this.pending.get(ticket);
  }
  expected(ticket: string): boolean {
    return this.find(ticket) !== undefined;
  }
  close(): void {
    this.pending.clear();
  }
  private browser(browser: string): Pending | undefined {
    this.prune();
    return [...this.pending.values()].find(
      (state) => state.browser === browser,
    );
  }
  ready(browser: string): boolean {
    const state = this.browser(browser);
    return !state || state.envelope !== null;
  }
  async submit(input: unknown): Promise<void> {
    const data = object(input);
    keys(data, ['ticket', 'commitment', 'envelope']);
    const state =
      typeof data['ticket'] === 'string'
        ? this.find(data['ticket'])
        : undefined;
    if (
      !state?.request ||
      state.envelope ||
      state.session ||
      data['commitment'] !== (await digest(canonical(state.request.transfer)))
    )
      throw new AccountError(409, 'Abertura encerrada ou divergente.');
    const envelope = sealedSecret(data['envelope']);
    if (canonical(envelope).length > 2048)
      throw new AccountError(413, 'Retorno de abertura excedido.');
    state.envelope = envelope;
  }
  confirmation(
    browser: string,
    identity: Omit<Identity, 'accountId'>,
    ticket?: string,
  ): string | undefined {
    const state = this.browser(browser);
    if (ticket && state?.request?.transfer.ticket !== ticket)
      throw new AccountError(
        409,
        'A abertura expirou ou foi interrompida. Inicie novamente.',
      );
    if (!state) return undefined;
    const config = state.request?.transfer.config;
    if (!config || !state.envelope)
      throw new AccountError(
        409,
        'A wallet ainda não concluiu a abertura das chaves.',
      );
    recoveryIdentity(
      config,
      { ...identity, accountId: config.accountId },
      this.origin,
    );
    return config.accountId;
  }
  bind(browser: string, session: AccountSession): void {
    const state = this.browser(browser);
    if (!state) return;
    if (!state.request) throw new AccountError(409, 'Abertura ausente.');
    recoveryIdentity(state.request.transfer.config, session, this.origin);
    state.session = {
      accountId: session.accountId,
      deviceId: session.deviceId,
      csrf: session.csrf,
    };
  }
  read(session: AccountSession, input: unknown) {
    const data = object(input);
    keys(data, ['ticket']);
    const state =
      typeof data['ticket'] === 'string'
        ? this.find(data['ticket'])
        : undefined;
    if (
      !state?.session ||
      !state.request ||
      !state.envelope ||
      state.session.accountId !== session.accountId ||
      state.session.deviceId !== session.deviceId ||
      state.session.csrf !== session.csrf
    )
      throw new AccountError(409, 'Abertura indisponível para este navegador.');
    return { request: state.request, envelope: state.envelope };
  }
  cancel(browser: string): void {
    for (const [ticket, state] of this.pending)
      if (state.browser === browser) this.pending.delete(ticket);
  }
  acknowledge(session: AccountSession, input: unknown): void {
    this.read(session, input);
    this.pending.delete(object(input)['ticket'] as string);
  }
}
