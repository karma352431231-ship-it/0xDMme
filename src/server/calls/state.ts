import { randomUUID } from 'node:crypto';
import { AccountError } from '../../shared/account/index.ts';
import { leaseMs, ringMs } from '../../shared/calls/index.ts';
import type { CallView, MediaState } from '../../shared/calls/index.ts';
import type { SealedSecret } from '../../shared/devices/index.ts';
import type { ContactAuthority, CallGate } from '../database/index.ts';

interface Endpoint {
  key: string;
  authority: {
    directory: string;
    session: Pick<
      ContactAuthority['session'],
      'accountId' | 'deviceId' | 'csrf'
    >;
  };
  channel: string;
  sequence: number;
  expires: number;
  listening: boolean;
  media: MediaState;
}
interface Connection {
  id: string;
  caller: Endpoint;
  recipient: string;
  directory: string;
  ringing: Map<string, Endpoint>;
  waiting: Set<string>;
  offers: Map<string, { sequence: number; body: SealedSecret }>;
  callee: Endpoint | null;
  phase: CallView['phase'];
  deadline: number | null;
  sequence: number;
  answered: number;
  signals: Map<string, { sequence: number; body: SealedSecret }>;
  lastOffer: number;
}
function unavailable(): never {
  throw new AccountError(409, 'Chamada indisponível.');
}
/** Single web process owns bounded RAM only. All mutations are synchronous. */
export class CallState {
  private readonly endpoints = new Map<string, Endpoint>();
  private readonly calls = new Map<string, Connection>();
  private readonly accounts = new Map<string, string>();
  private readonly capacity: number;
  private readonly clock: () => number;
  constructor(capacity: number, clock = Date.now) {
    this.capacity = capacity;
    this.clock = clock;
  }
  endpoint(
    a: ContactAuthority,
    request: { channel: string; sequence: number; at: number },
    register: boolean,
  ): Endpoint {
    this.clean();
    if (Math.abs(this.clock() - request.at) > 10_000)
      throw new AccountError(
        409,
        'Atualize a página: horário da chamada divergente.',
      );
    const key = `${a.session.accountId}:${a.session.deviceId}:${request.channel}`;
    let endpoint = this.endpoints.get(key);
    if (!endpoint) {
      if (!register) return unavailable();
      const siblings = [...this.endpoints.values()].filter(
        (e) => e.authority.session.accountId === a.session.accountId,
      );
      if (this.endpoints.size >= 1024 || siblings.length >= 64)
        throw new AccountError(
          429,
          'Limite temporário de aparelhos conectados.',
        );
      endpoint = {
        key,
        authority: {
          directory: a.directory,
          session: {
            accountId: a.session.accountId,
            deviceId: a.session.deviceId,
            csrf: a.session.csrf,
          },
        },
        channel: request.channel,
        sequence: 0,
        expires: 0,
        listening: false,
        media: 'idle',
      };
      this.endpoints.set(key, endpoint);
    }
    if (
      endpoint.authority.session.csrf !== a.session.csrf ||
      endpoint.authority.directory !== a.directory
    ) {
      this.endAccounts([a.session.accountId]);
      return unavailable();
    }
    this.checkEndpointLease(endpoint, register);
    if (request.sequence <= endpoint.sequence)
      throw new AccountError(409, 'Pedido de chamada repetido.');
    endpoint.sequence = request.sequence;
    endpoint.expires = this.clock() + leaseMs;
    return endpoint;
  }
  private checkEndpointLease(e: Endpoint, register: boolean): void {
    if (!register && e.expires <= this.clock()) return unavailable();
  }
  peer(account: string): string | null {
    const call = this.current(account);
    if (!call) return null;
    return call.caller.authority.session.accountId === account
      ? call.recipient
      : call.caller.authority.session.accountId;
  }
  synchronize(
    endpoint: Endpoint,
    input: { listening: boolean; media: MediaState; ack: number },
    gate: CallGate,
  ): CallView | null {
    endpoint.listening = input.listening && gate.enabled;
    endpoint.media = input.media;
    let call = this.current(endpoint.authority.session.accountId);
    if (call && !gate.allowed) this.remove(call);
    call = this.current(endpoint.authority.session.accountId);
    if (!call) return null;
    this.attach(call, endpoint);
    if (this.closedEndpoint(call, endpoint, input.media)) {
      this.remove(call);
      return null;
    }
    if (!this.validateCall(call, endpoint, gate)) return null;
    if (call.signals.get(endpoint.key)?.sequence === input.ack)
      call.signals.delete(endpoint.key);
    this.connectionState(call);
    return this.view(endpoint, call);
  }
  private closedEndpoint(
    c: Connection,
    e: Endpoint,
    media: MediaState,
  ): boolean {
    return (
      c.phase === 'active' &&
      media === 'idle' &&
      (e === c.caller || e === c.callee)
    );
  }
  private attach(call: Connection, e: Endpoint): void {
    if (
      call.phase !== 'ringing' ||
      !e.listening ||
      call.ringing.has(e.key) ||
      e.authority.session.accountId !== call.recipient ||
      e.authority.directory !== call.directory ||
      !call.waiting.has(e.authority.session.deviceId)
    )
      return;
    call.ringing.set(e.key, e);
    const offer = call.offers.get(e.authority.session.deviceId);
    if (offer && !call.signals.has(e.key)) call.signals.set(e.key, offer);
  }
  private validateCall(call: Connection, e: Endpoint, gate: CallGate): boolean {
    const caller = e === call.caller;
    const expected = caller ? call.directory : call.caller.authority.directory;
    if (expected !== gate.peerDirectory) {
      this.remove(call);
      return false;
    }
    const receiving = caller ? gate.peerReceiving : gate.receiving;
    if (call.phase === 'ringing' && !receiving) {
      this.remove(call);
      return false;
    }
    return true;
  }
  revalidate(e: Endpoint, gate: CallGate): void {
    const call = this.current(e.authority.session.accountId);
    if (call && !this.validateCall(call, e, gate)) return unavailable();
  }
  start(
    endpoint: Endpoint,
    peer: string,
    directory: string,
    gate: CallGate,
  ): CallView {
    const own = endpoint.authority.session.accountId;
    if (
      !gate.allowed ||
      !gate.peerReceiving ||
      gate.peerDirectory !== directory
    )
      return unavailable();
    if (this.occupied(own, peer)) return unavailable();
    const ringing = new Map(
      [...this.endpoints].filter(
        ([, e]) =>
          e.listening &&
          e.expires > this.clock() &&
          e.authority.session.accountId === peer &&
          e.authority.directory === directory,
      ),
    );
    const waiting = new Set(gate.wakeDevices ?? []);
    if (!ringing.size && !waiting.size) return unavailable();
    const call: Connection = {
      id: randomUUID(),
      caller: endpoint,
      recipient: peer,
      directory,
      ringing,
      waiting,
      offers: new Map(),
      callee: null,
      phase: 'ringing',
      deadline: this.clock() + ringMs,
      sequence: 0,
      answered: 0,
      signals: new Map(),
      lastOffer: 0,
    };
    this.calls.set(call.id, call);
    this.accounts.set(own, call.id);
    this.accounts.set(peer, call.id);
    return this.view(endpoint, call) ?? unavailable();
  }
  private occupied(own: string, peer: string): boolean {
    return (
      this.accounts.has(own) ||
      this.accounts.has(peer) ||
      this.calls.size >= this.capacity
    );
  }
  accept(endpoint: Endpoint, id: string): CallView {
    const call = this.require(endpoint, id);
    if (call.callee === endpoint)
      return this.view(endpoint, call) ?? unavailable();
    if (
      call.phase !== 'ringing' ||
      !call.ringing.has(endpoint.key) ||
      !call.signals.has(endpoint.key)
    )
      return unavailable();
    call.callee = endpoint;
    call.phase = 'connecting';
    call.deadline = this.clock() + leaseMs;
    call.ringing.clear();
    call.waiting.clear();
    call.offers.clear();
    for (const key of call.signals.keys())
      if (key !== endpoint.key) call.signals.delete(key);
    return this.view(endpoint, call) ?? unavailable();
  }
  offer(
    endpoint: Endpoint,
    input: {
      id: string;
      sequence: number;
      packets: { device: string; body: SealedSecret }[];
    },
  ): void {
    const call = this.require(endpoint, input.id);
    if (
      endpoint !== call.caller ||
      input.sequence !== call.sequence + 1 ||
      this.clock() - call.lastOffer < 1000
    )
      return unavailable();
    const targets = this.targetEndpoints(call);
    const devices = new Set([
      ...targets.map((e) => e.authority.session.deviceId),
      ...call.waiting,
    ]);
    this.validatePackets(input.packets, devices);
    call.signals.clear();
    call.offers.clear();
    for (const packet of input.packets)
      if (call.waiting.has(packet.device))
        call.offers.set(packet.device, {
          sequence: input.sequence,
          body: packet.body,
        });
    for (const target of targets) {
      const packet = input.packets.find(
        (p) => p.device === target.authority.session.deviceId,
      );
      if (packet)
        call.signals.set(target.key, {
          sequence: input.sequence,
          body: packet.body,
        });
    }
    call.sequence = input.sequence;
    call.lastOffer = this.clock();
  }
  private targetEndpoints(c: Connection): Endpoint[] {
    return c.callee ? [c.callee] : [...c.ringing.values()];
  }
  private validatePackets(
    packets: { device: string; body: SealedSecret }[],
    devices: Set<string>,
  ): void {
    if (
      packets.length !== devices.size ||
      new Set(packets.map((p) => p.device)).size !== devices.size
    )
      return unavailable();
    for (const p of packets) if (!devices.has(p.device)) return unavailable();
  }
  answer(
    endpoint: Endpoint,
    input: { id: string; sequence: number; body: SealedSecret },
  ): void {
    const call = this.require(endpoint, input.id);
    if (
      endpoint !== call.callee ||
      input.sequence !== call.sequence ||
      input.sequence <= call.answered
    )
      return unavailable();
    call.signals.delete(endpoint.key);
    call.signals.set(call.caller.key, {
      sequence: input.sequence,
      body: input.body,
    });
    call.answered = input.sequence;
  }
  targets(endpoint: Endpoint, id: string): string[] {
    const call = this.require(endpoint, id);
    return [
      ...new Set([
        ...(call.callee ? [call.callee] : [...call.ringing.values()]).map(
          (e) => e.authority.session.deviceId,
        ),
        ...call.waiting,
      ]),
    ];
  }
  end(endpoint: Endpoint, id: string): void {
    const call = this.current(endpoint.authority.session.accountId);
    if (!call || call.id !== id) return;
    this.require(endpoint, id);
    this.remove(call);
  }
  authorized(endpoint: Endpoint, id: string): void {
    this.require(endpoint, id);
  }
  pending(
    account: string,
    device: string,
    peerDirectory?: string | null,
  ): boolean {
    this.clean();
    const call = this.current(account);
    return (
      !!call &&
      call.recipient === account &&
      call.phase === 'ringing' &&
      call.offers.has(device) &&
      (peerDirectory === undefined ||
        peerDirectory === call.caller.authority.directory)
    );
  }
  invitation(
    endpoint: Endpoint,
    id: string,
  ): {
    account: string;
    devices: string[];
    deadline: number;
    directory: string;
  } | null {
    const call = this.require(endpoint, id);
    if (
      call.caller !== endpoint ||
      call.phase !== 'ringing' ||
      call.sequence !== 1 ||
      !call.deadline
    )
      return null;
    return {
      account: call.recipient,
      devices: [...call.waiting],
      deadline: call.deadline,
      directory: call.directory,
    };
  }
  ringing(id: string): boolean {
    this.clean();
    return this.calls.get(id)?.phase === 'ringing';
  }
  private require(endpoint: Endpoint, id: string): Connection {
    const call = this.calls.get(id);
    if (!call) return unavailable();
    if (
      call.caller === endpoint ||
      call.callee === endpoint ||
      call.ringing.has(endpoint.key)
    )
      return call;
    return unavailable();
  }
  private current(account: string): Connection | undefined {
    return this.calls.get(this.accounts.get(account) ?? '');
  }
  private view(e: Endpoint, c: Connection): CallView | null {
    const own = e === c.caller;
    if (!own && c.callee !== e && !c.ringing.has(e.key)) return null;
    const signal = c.signals.get(e.key);
    const remote = this.remote(c, own);
    return {
      id: c.id,
      ...remote,
      caller: own,
      phase: c.phase,
      deadline: c.deadline,
      authorizedFor: Math.max(
        0,
        Math.min(e.expires, c.caller.expires, c.callee?.expires ?? e.expires) -
          this.clock(),
      ),
      sequence: signal?.sequence ?? c.sequence,
      signal: signal?.body ?? null,
    };
  }
  private remote(c: Connection, caller: boolean) {
    if (!caller)
      return {
        peer: c.caller.authority.session.accountId,
        peerDevice: c.caller.authority.session.deviceId,
        peerDirectory: c.caller.authority.directory,
      };
    return {
      peer: c.recipient,
      peerDevice: c.callee?.authority.session.deviceId ?? null,
      peerDirectory: c.directory,
    };
  }
  private connectionState(c: Connection): void {
    if (!c.callee) return;
    if (c.caller.media === 'connected' && c.callee.media === 'connected') {
      c.phase = 'active';
      c.deadline = null;
    } else if (c.phase === 'active' && c.deadline === null)
      c.deadline = this.clock() + leaseMs;
  }
  private remove(c: Connection): void {
    this.calls.delete(c.id);
    this.accounts.delete(c.caller.authority.session.accountId);
    this.accounts.delete(c.recipient);
    c.signals.clear();
    c.ringing.clear();
    c.waiting.clear();
    c.offers.clear();
  }
  endAccounts(accounts: readonly string[]): void {
    for (const account of accounts) {
      const call = this.current(account);
      if (call) this.remove(call);
      for (const e of this.endpoints.values())
        if (e.authority.session.accountId === account) e.listening = false;
    }
  }
  clean(): void {
    const now = this.clock();
    for (const c of this.calls.values()) {
      if (c.deadline !== null && c.deadline <= now) {
        this.remove(c);
        continue;
      }
      if (c.caller.expires <= now || (c.callee && c.callee.expires <= now))
        this.remove(c);
      this.cleanRinging(c, now);
    }
    for (const [key, e] of this.endpoints)
      if (e.expires + 10_000 <= now) this.endpoints.delete(key);
  }
  private cleanRinging(c: Connection, now: number): void {
    if (c.callee) return;
    for (const [key, e] of c.ringing)
      if (e.expires <= now) {
        c.ringing.delete(key);
        c.signals.delete(key);
      }
    if (!c.ringing.size && !c.waiting.size) this.remove(c);
  }
  close(): void {
    this.endpoints.clear();
    this.calls.clear();
    this.accounts.clear();
  }
  get usage(): { calls: number; endpoints: number; packets: number } {
    return {
      calls: this.calls.size,
      endpoints: this.endpoints.size,
      packets: [...this.calls.values()].reduce(
        (n, c) => n + c.signals.size + c.offers.size,
        0,
      ),
    };
  }
}
