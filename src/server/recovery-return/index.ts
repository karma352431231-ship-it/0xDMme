import { randomBytes } from 'node:crypto';
import { AccountError, keys, object } from '../../shared/account/index.ts';
import type { AccountSession } from '../../shared/account/index.ts';
import { canonical, digest, sealedSecret } from '../../shared/devices/index.ts';
import type { SealedSecret } from '../../shared/devices/index.ts';
import {
  recoveryIdentity,
  recoveryTransfer,
} from '../../shared/wallet-recovery/index.ts';
import type { RecoveryTransfer } from '../../shared/wallet-recovery/index.ts';
import {
  TemporaryRequests,
  withTemporaryAdmission,
} from '../temporary-admission/index.ts';

interface Pending {
  session: Pick<AccountSession, 'accountId' | 'deviceId' | 'csrf'>;
  transfer: RecoveryTransfer;
  commitment: string;
  expires: number;
  envelope: SealedSecret | null;
  consumed: boolean;
}
/** Temporary, opaque transport only. Restart cancels requests; no accepted
 * vault data, signatures, keys or plaintext are stored here. */
export class RecoveryReturn {
  private readonly pending: TemporaryRequests<Pending>;
  private readonly byDevice = new Map<string, string>();
  private readonly origin: string;
  private readonly now: () => number;
  constructor(origin: string, now: () => number = Date.now) {
    this.origin = origin;
    this.now = now;
    this.pending = new TemporaryRequests({
      unavailable: 'Muitos retornos de recuperação. Aguarde.',
      now,
      removed: (ticket, state) => {
        const device = state.session.accountId + ':' + state.session.deviceId;
        if (this.byDevice.get(device) === ticket) this.byDevice.delete(device);
      },
    });
  }
  close(): void {
    this.pending.close();
  }
  private timestamps(state: Pending) {
    return {
      expiresAt: new Date(state.expires).toISOString(),
      serverTime: new Date(this.now()).toISOString(),
    };
  }
  async start(session: AccountSession, input: unknown) {
    return withTemporaryAdmission(
      'Muitos retornos de recuperação. Aguarde.',
      () => this.create(session, input),
    );
  }
  private async create(session: AccountSession, input: unknown) {
    const data = object(input);
    keys(data, ['wallet', 'config', 'receiver', 'count']);
    const transfer = recoveryTransfer({
      ...data,
      version: 1,
      ticket: randomBytes(32).toString('hex'),
    });
    recoveryIdentity(transfer.config, session, this.origin);
    const receiver = await crypto.subtle.importKey(
      'spki',
      Uint8Array.from(Buffer.from(transfer.receiver, 'base64')),
      { name: 'RSA-OAEP', hash: 'SHA-256' },
      false,
      ['encrypt'],
    );
    if ((receiver.algorithm as RsaHashedKeyAlgorithm).modulusLength !== 3072)
      throw new AccountError(400, 'Destino de recuperação inválido.');
    const commitment = await digest(canonical(transfer));
    const state: Pending = {
      session: {
        accountId: session.accountId,
        deviceId: session.deviceId,
        csrf: session.csrf,
      },
      transfer,
      commitment,
      expires: this.now() + 300_000,
      envelope: null,
      consumed: false,
    };
    if (!this.pending.add(transfer.ticket, state, state.expires))
      throw new AccountError(429, 'Muitos retornos de recuperação. Aguarde.');
    const device = session.accountId + ':' + session.deviceId;
    const prior = this.pending.get(this.byDevice.get(device) ?? '');
    // Keep the earlier request's original expiry and replay rejection.
    if (prior) {
      prior.consumed = true;
      prior.envelope = null;
    }
    this.byDevice.set(device, transfer.ticket);
    return {
      ticket: transfer.ticket,
      commitment: state.commitment,
      ...this.timestamps(state),
    };
  }
  private request(input: unknown): Pending {
    const data = object(input);
    keys(data, ['ticket', 'commitment']);
    const state =
      typeof data['ticket'] === 'string'
        ? this.pending.get(data['ticket'])
        : undefined;
    if (!state || state.consumed || state.commitment !== data['commitment'])
      throw new AccountError(
        409,
        'Retorno expirado, cancelado ou divergente. Inicie novamente.',
      );
    return state;
  }
  requestPublic(input: unknown) {
    const state = this.request(input);
    if (state.envelope)
      throw new AccountError(409, 'Este pedido já recebeu um retorno.');
    return { transfer: state.transfer, ...this.timestamps(state) };
  }
  submit(input: unknown) {
    const data = object(input);
    keys(data, ['ticket', 'commitment', 'envelope']);
    const state = this.request({
      ticket: data['ticket'],
      commitment: data['commitment'],
    });
    if (state.envelope) throw new AccountError(409, 'Retorno já enviado.');
    const envelope = sealedSecret(data['envelope']);
    if (canonical(envelope).length > 2048)
      throw new AccountError(413, 'Envelope de retorno excedido.');
    state.envelope = envelope;
    return { status: 'encrypted' };
  }
  private owned(session: AccountSession, input: unknown): Pending {
    const state = this.request(input);
    if (
      state.session.accountId !== session.accountId ||
      state.session.deviceId !== session.deviceId ||
      state.session.csrf !== session.csrf
    )
      throw new AccountError(403, 'Retorno pertence a outro navegador.');
    return state;
  }
  take(session: AccountSession, input: unknown) {
    const state = this.owned(session, input);
    const envelope = state.envelope;
    if (envelope) {
      state.consumed = true;
      state.envelope = null;
    }
    return { envelope, ...this.timestamps(state) };
  }
  cancel(session: AccountSession, input: unknown) {
    const state = this.owned(session, input);
    state.consumed = true;
    state.envelope = null;
    return { status: 'cancelled' };
  }
}
