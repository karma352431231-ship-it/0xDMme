import {
  AccountError,
  keys,
  object,
  uuid,
} from '../../shared/account/index.ts';
import type { AccountSession } from '../../shared/account/index.ts';
import {
  fingerprint,
  sealedSecret,
  deviceLimit,
} from '../../shared/devices/index.ts';
import { integer } from '../../shared/vault/index.ts';
import { mediaState } from '../../shared/calls/index.ts';
import type { CallSnapshot } from '../../shared/calls/index.ts';
import type {
  CallStore,
  DatabaseChanges,
  ContactAuthority,
} from '../database/index.ts';
import type { MessageService } from '../messages/index.ts';
import { CallState } from './state.ts';
import { turnCredentials } from './config.ts';
import type { TurnConfig } from './config.ts';
export { readTurnConfiguration } from './config.ts';
export type { TurnConfig } from './config.ts';
export { CallState } from './state.ts';
export { turnCredentials } from './config.ts';

interface Options {
  store: CallStore;
  messages: MessageService;
  config: TurnConfig | null;
  changes: DatabaseChanges;
  wake?: (invite: {
    account: string;
    devices: string[];
    deadline: number;
    valid: () => Promise<boolean>;
  }) => Promise<void>;
}
/** Separate from durable messaging. HTTP only adapts authenticated signed operations. */
export class CallService {
  private readonly options: Options;
  private readonly state: CallState;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly unsubscribe: () => void;
  constructor(options: Options) {
    this.options = options;
    this.state = new CallState(options.config?.maxCalls ?? 16);
    this.unsubscribe = options.changes.subscribe({
      notify: (change) => {
        if (
          change.authorization ||
          change.revoked.length ||
          change.ended.length
        )
          this.state.endAccounts(change.accounts);
        this.schedule();
      },
      failed: () => {
        this.state.close();
        this.schedule();
      },
    });
  }
  async operate(
    op: string,
    session: AccountSession,
    input: unknown,
  ): Promise<unknown> {
    const { proof } = await this.options.messages.authenticate(
      `call:${op}`,
      session,
      input,
    );
    const a = { session, directory: proof.directory };
    const d = proof.payload;
    if (op === 'configure') return this.configure(a, d);
    const request = {
      channel: uuid(d['channel']),
      sequence: integer(d['request'], Number.MAX_SAFE_INTEGER),
      at: integer(d['at'], Number.MAX_SAFE_INTEGER),
    };
    const peer =
      op === 'start' ? uuid(d['peer']) : this.state.peer(session.accountId);
    try {
      const result = await this.options.store.authorize(a, peer, (gate) => {
        if (op === 'sync' && !this.options.config)
          return {
            configured: false,
            enabled: gate.enabled,
            revision: gate.revision,
            call: null,
          } satisfies CallSnapshot;
        if (!this.options.config)
          throw new AccountError(
            503,
            'Chamadas aguardam a configuração do TURN próprio.',
          );
        const endpoint = this.state.endpoint(a, request, op === 'sync');
        if (peer && !gate.allowed) this.state.endAccounts([session.accountId]);
        if (!this.options.wake) gate.wakeDevices = [];
        const result = this.action(op, { endpoint, d, gate });
        return { result, endpoint };
      });
      if (
        typeof result === 'object' &&
        result !== null &&
        'endpoint' in result
      ) {
        if (op === 'offer') await this.wake(a, result.endpoint, uuid(d['id']));
        return result.result;
      }
      return result;
    } catch (error: unknown) {
      if (!(error instanceof AccountError))
        this.state.endAccounts([session.accountId]);
      throw error;
    } finally {
      this.schedule();
    }
  }
  private async wake(
    a: ContactAuthority,
    endpoint: ReturnType<CallState['endpoint']>,
    id: string,
  ): Promise<void> {
    const invite = this.state.invitation(endpoint, id);
    if (!invite || !this.options.wake) return;
    await this.options.wake({
      account: invite.account,
      devices: invite.devices,
      deadline: invite.deadline,
      valid: () =>
        this.options.store.authorize(
          a,
          invite.account,
          (gate) =>
            gate.allowed &&
            gate.peerReceiving &&
            this.state.ringing(id) &&
            gate.peerDirectory === invite.directory,
        ),
    });
  }
  async incoming(session: AccountSession, directory: string): Promise<boolean> {
    const peer = this.state.peer(session.accountId);
    if (!peer || !this.state.pending(session.accountId, session.deviceId))
      return false;
    return this.options.store.authorize(
      { session, directory },
      peer,
      (gate) => {
        if (!gate.allowed || !gate.receiving) {
          this.state.endAccounts([session.accountId]);
          return false;
        }
        return this.state.pending(
          session.accountId,
          session.deviceId,
          gate.peerDirectory,
        );
      },
    );
  }
  private async configure(
    a: ContactAuthority,
    d: Record<string, unknown>,
  ): Promise<unknown> {
    keys(d, ['enabled', 'revision']);
    if (typeof d['enabled'] !== 'boolean')
      throw new AccountError(400, 'Preferência inválida.');
    await this.options.store.configure(a, {
      enabled: d['enabled'],
      revision: integer(d['revision'], Number.MAX_SAFE_INTEGER),
    });
    return { status: 'saved' };
  }
  private action(
    op: string,
    c: {
      endpoint: ReturnType<CallState['endpoint']>;
      d: Record<string, unknown>;
      gate: import('../database/index.ts').CallGate;
    },
  ): unknown {
    const { endpoint, d, gate } = c;
    const common = ['channel', 'request', 'at'];
    if (op === 'sync') {
      keys(d, [...common, 'listening', 'media', 'ack']);
      if (typeof d['listening'] !== 'boolean')
        throw new AccountError(400, 'Disponibilidade inválida.');
      return {
        configured: true,
        enabled: gate.enabled,
        revision: gate.revision,
        call: this.state.synchronize(
          endpoint,
          {
            listening: d['listening'],
            media: mediaState(d['media']),
            ack: integer(d['ack'], Number.MAX_SAFE_INTEGER),
          },
          gate,
        ),
      } satisfies CallSnapshot;
    }
    if (op === 'start') {
      keys(d, [...common, 'peer', 'directory']);
      const call = this.state.start(
        endpoint,
        uuid(d['peer']),
        fingerprint(d['directory']),
        gate,
      );
      return { call, devices: this.state.targets(endpoint, call.id) };
    }
    this.state.revalidate(endpoint, gate);
    return this.participantAction(op, endpoint, d);
  }
  private participantAction(
    op: string,
    endpoint: ReturnType<CallState['endpoint']>,
    d: Record<string, unknown>,
  ): unknown {
    const common = ['channel', 'request', 'at', 'id'];
    const id = uuid(d['id']);
    if (op === 'offer') {
      keys(d, [...common, 'sequence', 'packets']);
      this.state.offer(endpoint, {
        id,
        sequence: integer(d['sequence'], Number.MAX_SAFE_INTEGER),
        packets: packets(d['packets']),
      });
    } else if (op === 'answer') {
      keys(d, [...common, 'sequence', 'body']);
      this.state.answer(endpoint, {
        id,
        sequence: integer(d['sequence'], Number.MAX_SAFE_INTEGER),
        body: sealedSecret(d['body']),
      });
    } else return this.controlAction(op, endpoint, d);
    return { status: 'sent' };
  }
  private controlAction(
    op: string,
    e: ReturnType<CallState['endpoint']>,
    d: Record<string, unknown>,
  ): unknown {
    keys(d, ['channel', 'request', 'at', 'id']);
    const id = uuid(d['id']);
    if (op === 'accept') return this.state.accept(e, id);
    if (op === 'end') {
      this.state.end(e, id);
      return { status: 'ended' };
    }
    if (op === 'turn' && this.options.config) {
      this.state.authorized(e, id);
      return turnCredentials(this.options.config);
    }
    throw new AccountError(404, 'Operação de chamada indisponível.');
  }
  close(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.unsubscribe();
    this.state.close();
  }
  private schedule(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const next = this.state.nextExpiry();
    if (next === null) return;
    this.timer = setTimeout(
      () => {
        this.state.clean();
        this.schedule();
      },
      Math.max(1, next - Date.now()),
    );
    this.timer.unref();
  }
}
function packets(input: unknown) {
  if (!Array.isArray(input) || !input.length || input.length > deviceLimit)
    throw new AccountError(413, 'Destinatários excedidos.');
  const rows: unknown[] = input;
  return rows.map((raw) => {
    const d = object(raw);
    keys(d, ['device', 'body']);
    return { device: uuid(d['device']), body: sealedSecret(d['body']) };
  });
}
