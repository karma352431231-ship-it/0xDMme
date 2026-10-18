import { t, translatedError } from '../../shared/i18n/index.ts';
import { AccountError, object, uuid } from '../../shared/account/index.ts';
import type { AccountSession } from '../../shared/account/index.ts';
import { callSnapshot, leaseMs, pollMs } from '../../shared/calls/index.ts';
import type {
  CallView,
  CallDescription,
  CallSnapshot,
} from '../../shared/calls/index.ts';
import { eventHash } from '../../shared/devices/index.ts';
import type { VaultAccess } from '../vault-authority/index.ts';
import type { VaultEntry, VaultSync } from '../vault-sync/index.ts';
import type { VoicePlayback } from '../voice-playback/index.ts';
import { CallTransport } from './transport.ts';
import { CallSecurity } from './security.ts';
import { VoiceConnection, iceConfiguration } from './rtc.ts';

export interface CallUiState {
  call: CallView | null;
  notice: string;
  busy: boolean;
  muted: boolean;
  captureStopped?: boolean;
  autoplay: boolean;
  seconds: number;
  configured: boolean;
  enabled: boolean;
  connected: boolean;
}
/** Optional record of unanswered incoming calls; failures never affect the call itself. */
export interface CallHistory {
  missed: (call: { id: string; peer: string; at: number }) => void;
  answered: (id: string) => void;
}
export class VoiceCalls {
  private readonly transport: CallTransport;
  private readonly security: CallSecurity;
  private readonly playback: VoicePlayback;
  private readonly before: () => void;
  private readonly publish: (state: CallUiState) => void;
  private readonly history: CallHistory | null;
  private session: AccountSession | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly watchdog: ReturnType<typeof setInterval>;
  private snapshot: CallSnapshot = {
    configured: false,
    enabled: true,
    revision: 0,
    call: null,
  };
  private call: CallView | null = null;
  private rtc: VoiceConnection | null = null;
  private verified: CallDescription | null = null;
  private ack = 0;
  private sequence = 0;
  private targets: string[] = [];
  private busy = false;
  private polling = false;
  private notice = t('Chamadas: entre e autorize este aparelho.');
  private settledNotice = false;
  private generation = 0;
  private wakePending = false;
  private primed = false;
  private lastLease = 0;
  private authorizationUntil = 0;
  private started = 0;
  private recovery = 0;
  private restarting = false;
  private lastRestart = 0;
  private restartAttempts = 0;
  private audioBlocked = false;
  constructor(options: {
    access: VaultAccess;
    sync: VaultSync;
    playback: VoicePlayback;
    before: () => void;
    publish: (state: CallUiState) => void;
    history?: CallHistory;
  }) {
    this.transport = new CallTransport(options.access);
    this.security = new CallSecurity(options.access, options.sync);
    this.playback = options.playback;
    this.before = options.before;
    this.publish = options.publish;
    this.history = options.history ?? null;
    this.watchdog = setInterval(() => this.watch(), 1000);
  }
  get active(): boolean {
    return this.call !== null || this.rtc !== null;
  }
  setSession(session: AccountSession | null): void {
    if (
      session?.csrf === this.session?.csrf &&
      session?.deviceId === this.session?.deviceId
    )
      return;
    this.clear(t('Chamadas: entre e autorize este aparelho.'));
    this.transport.reset();
    this.security.clear();
    this.primed = false;
    this.session = session;
    this.lastLease = 0;
    this.settledNotice = false;
    if (session) this.ready();
  }
  ready(): void {
    if (this.polling) return;
    if (this.session && navigator.onLine && !this.timer)
      this.timer = setTimeout(() => {
        this.timer = null;
        void this.poll();
      }, 0);
  }
  /** One pending hint; never overlap signing or lose a hint behind a snapshot. */
  wake(): void {
    if (!this.session || !navigator.onLine || this.wakePending) return;
    this.wakePending = true;
    this.resumeWake();
  }
  private resumeWake(): void {
    if (!this.wakePending || this.busy || this.polling) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.schedule();
  }
  private guard(g: number): void {
    if (g !== this.generation || !this.session)
      throw new Error('Chamada encerrada.');
  }
  private currentNotice(): string {
    return this.rtc?.captureStopped ? t('calls.capture-stopped') : this.notice;
  }
  private render(): void {
    this.publish({
      call: this.call,
      notice: this.currentNotice(),
      busy: this.busy || (this.polling && this.call !== null),
      muted: this.rtc?.muted ?? false,
      captureStopped: this.rtc?.captureStopped ?? false,
      autoplay: this.audioBlocked,
      seconds: this.started
        ? Math.floor((Date.now() - this.started) / 1000)
        : 0,
      configured: this.snapshot.configured,
      enabled: this.snapshot.enabled,
      connected: this.rtc?.state === 'connected',
    });
  }
  private connection(): VoiceConnection {
    const g = this.generation;
    const rtc = new VoiceConnection({
      changed: (state) => {
        if (g !== this.generation) return;
        if (state === 'connected') {
          this.started ||= Date.now();
          this.recovery = 0;
          this.restartAttempts = 0;
          this.notice = t('Chamada conectada · voz criptografada.');
        }
        if (state === 'disconnected') {
          this.recovery ||= Date.now();
          this.notice = t('Reconectando pelo TURN…');
        }
        this.render();
      },
      failed: (notice) => {
        if (g === this.generation) void this.end(notice);
      },
      autoplay: () => {
        this.audioBlocked = true;
        this.render();
      },
    });
    this.rtc = rtc;
    return rtc;
  }
  async start(peer: string): Promise<void> {
    await this.run(async (g) => {
      if (this.active) {
        this.notice = t('Encerre a chamada atual primeiro.');
        return;
      }
      if (!this.snapshot.configured)
        throw new Error('Chamadas aguardam a configuração do TURN próprio.');
      if (!this.prepareAudio()) return;
      const rtc = this.connection();
      await rtc.acquire();
      this.guard(g);
      const directory = await this.security.directory(peer);
      this.guard(g);
      const raw = object(
        await this.transport.request('start', {
          peer,
          directory: await eventHash(directory),
        }),
      );
      this.guard(g);
      this.call = callSnapshot({ ...this.snapshot, call: raw['call'] }).call;
      const devices = raw['devices'];
      if (!Array.isArray(devices) || devices.length > 32)
        throw new Error('Aparelhos da chamada inválidos.');
      const values: unknown[] = devices;
      this.targets = values.map(uuid);
      this.sequence = 1;
      this.notice = t('Chamando…');
      this.render();
      if (raw['invitation'] === true) await this.sendInvitation(g);
      const config = iceConfiguration(
        await this.transport.request('turn', { id: this.require().id }),
      );
      this.guard(g);
      rtc.create(config);
      await this.sendOffer(false, g);
      this.guard(g);
    });
  }
  async accept(): Promise<void> {
    await this.run(async (g) => {
      const call = this.require(),
        description = this.verified;
      if (call.caller || !description || description.id !== call.id)
        throw new Error('Aguarde a confirmação da identidade da chamada.');
      if (!this.prepareAudio()) return;
      const rtc = this.connection();
      await rtc.acquire();
      this.guard(g);
      const accepted = await this.transport.request('accept', { id: call.id });
      this.guard(g);
      this.history?.answered(call.id);
      this.call = callSnapshot({ ...this.snapshot, call: accepted }).call;
      const config = iceConfiguration(
        await this.transport.request('turn', { id: call.id }),
      );
      this.guard(g);
      rtc.create(config);
      if (description.type !== 'invite') await this.sendAnswer(description, g);
      this.guard(g);
      this.notice = t('Conectando…');
    });
  }
  private prepareAudio(): boolean {
    try {
      this.before();
      this.playback.pause();
      return true;
    } catch (error: unknown) {
      this.notice =
        error instanceof Error
          ? translatedError(error.message)
          : t('Pare a gravação de voz antes de usar o microfone.');
      return false;
    }
  }
  private async sendInvitation(g: number): Promise<void> {
    const call = this.require();
    const packets = await this.security.seal({
      view: call,
      devices: this.targets,
      sequence: 0,
      type: 'invite',
      sdp: '',
    });
    this.guard(g);
    await this.transport.request('invite', { id: call.id, packets });
    this.guard(g);
  }
  private async sendOffer(restart: boolean, g: number): Promise<void> {
    const call = this.require(),
      rtc = this.rtc;
    if (!rtc) throw new Error('Microfone encerrado.');
    if (restart) {
      const config = iceConfiguration(
        await this.transport.request('turn', { id: call.id }),
      );
      this.guard(g);
      // Updating credentials preserves the mandatory relay policy.
      rtc.configure(config);
      this.sequence++;
    }
    const sdp = await rtc.offer(restart);
    this.guard(g);
    const devices = call.peerDevice ? [call.peerDevice] : this.targets;
    const packets = await this.security.seal({
      view: call,
      devices,
      sequence: this.sequence,
      type: 'offer',
      sdp,
    });
    this.guard(g);
    await this.transport.request('offer', {
      id: call.id,
      sequence: this.sequence,
      packets,
    });
    this.guard(g);
  }
  private async sendAnswer(
    description: CallDescription,
    g: number,
  ): Promise<void> {
    const call = this.require(),
      rtc = this.rtc;
    if (!rtc || !call.peerDevice)
      throw new Error('Extremo da chamada ausente.');
    const sdp = await rtc.answer(description.sdp);
    this.guard(g);
    const packets = await this.security.seal({
      view: call,
      devices: [call.peerDevice],
      sequence: description.sequence,
      type: 'answer',
      sdp,
    });
    this.guard(g);
    const packet = packets[0];
    if (!packet) throw new Error('Resposta protegida ausente.');
    await this.transport.request('answer', {
      id: call.id,
      sequence: description.sequence,
      body: packet.body,
    });
    this.guard(g);
    this.ack = description.sequence;
  }
  private async poll(): Promise<void> {
    if (this.polling || !this.session || !navigator.onLine) {
      this.schedule();
      return;
    }
    this.polling = true;
    if (!this.busy) this.wakePending = false;
    const g = this.generation;
    const requested = Date.now();
    try {
      const raw = await this.transport.request('sync', {
        // An open authorized tab can ring while its heartbeat still runs.
        // Suspended/closed pages lose their lease instead of advertising presence.
        listening: true,
        media: this.rtc?.state ?? 'idle',
        ack: this.ack,
      });
      this.guard(g);
      this.snapshot = callSnapshot(raw);
      this.security.setContext(this.snapshot.invitation === true);
      // Count conservatively from request start, including signing/network time.
      // Both participants expire without adding another polling interval.
      this.authorizationUntil = this.snapshot.call
        ? requested + this.snapshot.call.authorizedFor
        : 0;
      this.lastLease = Date.now();
      if (!this.busy) await this.applySnapshot(g);
      this.primeIdentities(g);
    } catch (error: unknown) {
      this.pollError(error, g);
    } finally {
      this.polling = false;
      this.render();
      this.schedule();
    }
  }
  private primeIdentities(g: number): void {
    if (this.primed || this.active || !this.snapshot.invitation) return;
    this.primed = true;
    // One session-bound preparation, shared with an overlapping user operation.
    // It reads only existing pins; every call still checks fresh remote context.
    void this.security.prime().catch((error: unknown) => {
      if (g !== this.generation || this.active || this.busy) return;
      this.notice =
        error instanceof Error
          ? translatedError(error.message)
          : t('Chamadas indisponíveis agora.');
      this.render();
    });
  }
  private pollError(error: unknown, g: number): void {
    if (g !== this.generation) return;
    if (
      error instanceof AccountError &&
      [401, 403, 409].includes(error.status)
    ) {
      this.clear(
        this.active
          ? t('Chamada encerrada: autorização indisponível.')
          : translatedError(error.message),
      );
      return;
    }
    if (!this.active)
      this.notice =
        error instanceof Error
          ? translatedError(error.message)
          : t('Chamadas indisponíveis agora.');
  }
  private async applySnapshot(g: number): Promise<void> {
    const next = this.snapshot.call;
    if (!next) {
      this.idleSnapshot();
      return;
    }
    if (this.call && this.call.id !== next.id)
      throw new Error('Estado da chamada divergente.');
    await this.applyInvitation(next, g);
    if (next.signal && next.sequence > this.ack) {
      const description = await this.description(next, g);
      if (this.supersededSnapshot()) return;
      this.verified = description;
      if (!this.call) {
        this.call = next;
        this.notice = t('Chamada de voz recebida.');
      }
      await this.receive(next, description, g);
    }
    if (this.call) this.call = next;
    this.connectingDeadline(next);
  }
  private async applyInvitation(next: CallView, g: number): Promise<void> {
    if (!next.caller && !next.signal && next.invitation && !this.call) {
      const description = await this.description(next, g);
      // A hint received during verification may be a cancellation or a newer
      // negotiation. Fetch the current signed snapshot before presenting it.
      if (this.supersededSnapshot()) return;
      this.verified = description;
      this.call = next;
      this.notice = t('Chamada de voz recebida.');
    }
  }
  private supersededSnapshot(): boolean {
    if (this.expiredAuthorization()) this.wakePending = true;
    return this.wakePending;
  }
  private idleSnapshot(): void {
    if (this.call) {
      // An incoming call that stopped ringing here was not answered or declined
      // on this device; another device's "answered" mark removes it later.
      if (!this.call.caller && this.call.phase === 'ringing')
        this.history?.missed({
          id: this.call.id,
          peer: this.call.peer,
          at: Date.now(),
        });
      this.clear(t('Chamada encerrada ou indisponível.'));
      return;
    }
    if (this.settledNotice) return;
    this.notice = this.snapshot.configured
      ? t('Chamadas disponíveis com o app aberto.')
      : t('Chamadas aguardam a configuração do TURN próprio.');
  }
  private connectingDeadline(view: CallView): void {
    if (
      view.phase === 'connecting' &&
      !this.recovery &&
      this.rtc?.state !== 'connected'
    )
      this.recovery = Date.now();
    if (view.phase === 'active' && view.deadline !== null) {
      this.recovery ||= Date.now();
      this.notice = t('Reconectando pelo TURN…');
    }
  }
  private async description(
    view: CallView,
    g: number,
  ): Promise<CallDescription> {
    if (
      this.verified?.id === view.id &&
      this.verified.sequence === view.sequence &&
      (this.verified.type === 'invite') === !view.signal
    )
      return this.verified;
    try {
      const d = await this.security.open(view);
      this.guard(g);
      return d;
    } catch (error: unknown) {
      await this.transport
        .request('end', { id: view.id })
        .catch(() => undefined);
      this.guard(g);
      this.clear(t('Chamada rejeitada: identidade ou negociação inválida.'));
      throw error;
    }
  }
  private async receive(
    view: CallView,
    d: CallDescription,
    g: number,
  ): Promise<void> {
    if (view.caller) {
      if (!this.rtc) throw new Error('Conexão ausente.');
      await this.rtc.accept(d.sdp);
      this.guard(g);
      this.ack = d.sequence;
    } else if (view.phase !== 'ringing' && this.rtc) {
      await this.sendAnswer(d, g);
      this.guard(g);
    }
  }
  private schedule(): void {
    if (!this.session || this.timer) return;
    this.timer = setTimeout(
      () => {
        this.timer = null;
        void this.poll();
      },
      // Server hints are already coalesced; the pending flag bounds local work.
      this.wakePending && !this.busy
        ? 0
        : this.snapshot.configured
          ? pollMs
          : 30_000,
    );
  }
  private watch(): void {
    if (!this.active) return;
    const expired = this.expiredAuthorization();
    if (expired) {
      void this.end(expired);
      return;
    }
    if (this.recovery && Date.now() - this.recovery >= leaseMs) {
      void this.end(t('Não foi possível reconectar em 20 segundos.'));
      return;
    }
    if (this.call?.deadline && this.call.deadline <= Date.now()) {
      void this.end(t('Chamada encerrada ou indisponível.'));
      return;
    }
    this.maybeRestart();
    this.render();
  }
  private expiredAuthorization(): string | null {
    const now = Date.now();
    if (this.lastLease && now - this.lastLease >= leaseMs)
      return t('Chamada encerrada: conexão com o servidor perdida.');
    if (this.authorizationUntil && now >= this.authorizationUntil)
      return t('Chamada encerrada: autorização indisponível.');
    return null;
  }
  private maybeRestart(): void {
    if (this.restartAttempts >= 2 || Date.now() - this.lastRestart < 8000)
      return;
    const disconnected = this.disconnected();
    if (
      disconnected &&
      this.call?.caller &&
      !this.restarting &&
      !this.busy &&
      !this.polling
    )
      void this.restart();
  }
  private disconnected(): boolean {
    return (
      this.rtc?.state === 'disconnected' ||
      (this.call?.phase === 'active' && this.call.deadline !== null)
    );
  }
  private async restart(): Promise<void> {
    this.restarting = true;
    this.lastRestart = Date.now();
    this.restartAttempts++;
    const g = this.generation;
    try {
      await this.sendOffer(true, g);
    } catch (error: unknown) {
      if (g !== this.generation) return;
      if (
        error instanceof AccountError &&
        [401, 403, 409].includes(error.status)
      )
        await this.end(t('Chamada encerrada: autorização mudou.'));
      else {
        this.notice = t('Reconectando pelo TURN…');
        this.render();
      }
    } finally {
      this.restarting = false;
    }
  }
  private require(): CallView {
    if (!this.call) throw new Error('Chamada encerrada.');
    return this.call;
  }
  private async run(
    work: (generation: number) => Promise<void>,
  ): Promise<void> {
    if (this.busy) return;
    const until = Date.now() + leaseMs;
    while (this.polling && Date.now() < until)
      await new Promise<void>((resolve) => setTimeout(resolve, 50));
    if (this.polling || this.busy) return;
    this.busy = true;
    const g = this.generation;
    this.render();
    try {
      await work(g);
    } catch (error: unknown) {
      if (g === this.generation)
        await this.end(
          error instanceof Error
            ? translatedError(error.message)
            : t('Não foi possível iniciar a chamada.'),
        );
    } finally {
      if (g === this.generation) this.busy = false;
      this.render();
      this.resumeWake();
      this.ready();
    }
  }
  async end(notice = t('Chamada encerrada.')): Promise<void> {
    const id = this.call?.id;
    // Queue the signed end before invalidating local resources; authorization remains checked.
    const sent = id ? this.transport.request('end', { id }) : null;
    this.clear(notice);
    const closed = this.generation;
    try {
      await sent;
    } catch {
      // Local media is already stopped. A signed idle heartbeat or lease expiry
      // closes the remote side; never claim that the server acknowledged it.
      if (closed === this.generation && notice === t('Chamada encerrada.')) {
        this.notice = t(
          'Áudio encerrado neste aparelho. Sem confirmação do servidor; o outro lado encerra em até 20 segundos.',
        );
        this.render();
      }
    }
  }
  private clear(notice: string): void {
    this.generation++;
    this.wakePending = false;
    this.busy = false;
    this.rtc?.close();
    this.rtc = null;
    this.call = null;
    this.snapshot.call = null;
    this.verified = null;
    this.ack = 0;
    this.sequence = 0;
    this.targets = [];
    this.started = 0;
    this.authorizationUntil = 0;
    this.recovery = 0;
    this.lastRestart = 0;
    this.restartAttempts = 0;
    this.audioBlocked = false;
    this.notice = notice;
    this.settledNotice = true;
    this.render();
  }
  mute(): void {
    this.rtc?.mute();
    this.render();
  }
  async play(): Promise<void> {
    this.audioBlocked = false;
    await this.rtc?.play();
    this.render();
  }
  async stopCaptureForInspection(): Promise<void> {
    const rtc = this.rtc,
      g = this.generation;
    if (!rtc || rtc.state !== 'connected') throw new Error('Conexão ausente.');
    try {
      await rtc.stopCaptureForInspection();
      this.guard(g);
    } finally {
      this.render();
    }
  }
  async inspectAudio() {
    const rtc = this.rtc,
      g = this.generation;
    if (!rtc) throw new Error('Conexão ausente.');
    const report = await rtc.inspectAudio();
    this.guard(g);
    return report;
  }
  async configure(enabled: boolean): Promise<void> {
    await this.run(async (g) => {
      await this.transport.request('configure', {
        enabled,
        revision: this.snapshot.revision,
      });
      this.guard(g);
      this.snapshot.enabled = enabled;
      this.notice = enabled
        ? t('Recebimento de chamadas ativado.')
        : t('Recebimento de chamadas desativado.');
    });
  }
  dispose(): void {
    clearInterval(this.watchdog);
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    void this.end();
    this.session = null;
  }
}

/**
 * Missed calls in the encrypted vault (plan §5.11, decision of 09/10/2026).
 * The server stores only opaque blocks. A `settings` record with its own entity
 * and label keeps older app versions, which filter by label, from reading it.
 */
const entity = '1bc0cb45-3af0-4298-b002-0d533d5bae79';
const label = 'Chamadas perdidas';
export const callLogLimit = 50;
export const callLogLifetime = 30 * 24 * 60 * 60 * 1000;

export interface MissedCall {
  id: string;
  peer: string;
  at: number;
}
/** Answered marks let every device drop a call another device answered. */
export interface CallLogValue {
  version: 1;
  missed: MissedCall[];
  answered: { id: string; at: number }[];
  clearedAt: number;
}

export function emptyCallLog(): CallLogValue {
  return { version: 1, missed: [], answered: [], clearedAt: 0 };
}

function timestamp(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
    throw new Error('Registro de chamadas inválido.');
  return value;
}

export function parseCallLog(text: string): CallLogValue {
  const data = object(JSON.parse(text) as unknown);
  if (
    data['version'] !== 1 ||
    !Array.isArray(data['missed']) ||
    !Array.isArray(data['answered']) ||
    data['missed'].length > callLogLimit ||
    data['answered'].length > callLogLimit
  )
    throw new Error('Registro de chamadas inválido.');
  const missed: unknown[] = data['missed'];
  const answered: unknown[] = data['answered'];
  return {
    version: 1,
    missed: missed.map((value) => {
      const row = object(value);
      return {
        id: uuid(row['id']),
        peer: uuid(row['peer']),
        at: timestamp(row['at']),
      };
    }),
    answered: answered.map((value) => {
      const row = object(value);
      return { id: uuid(row['id']), at: timestamp(row['at']) };
    }),
    clearedAt: timestamp(data['clearedAt']),
  };
}

/** Union of device versions, then retention: 30 days, 50 newest of each kind, nothing before a clear. */
export function mergeCallLogs(
  values: readonly CallLogValue[],
  now: number,
): CallLogValue {
  const clearedAt = Math.max(0, ...values.map((value) => value.clearedAt));
  const oldest = Math.max(clearedAt, now - callLogLifetime);
  const keep = <T extends { id: string; at: number }>(rows: T[]): T[] =>
    [...new Map(rows.map((row) => [row.id, row])).values()]
      .filter((row) => row.at > oldest)
      .sort((a, b) => b.at - a.at)
      .slice(0, callLogLimit);
  return {
    version: 1,
    missed: keep(values.flatMap((value) => value.missed)),
    answered: keep(values.flatMap((value) => value.answered)),
    clearedAt,
  };
}

export function visibleMissedCalls(value: CallLogValue): MissedCall[] {
  const answered = new Set(value.answered.map((row) => row.id));
  return value.missed.filter((call) => !answered.has(call.id));
}

export class CallLog {
  private readonly sync: VaultSync;
  // Writes that failed (offline, sync incomplete) stay visible and are retried.
  private pending = emptyCallLog();
  constructor(sync: VaultSync) {
    this.sync = sync;
  }
  private entries(): VaultEntry[] {
    return [...this.sync.currentHeads().values()]
      .flat()
      .filter(
        (entry) =>
          entry.change.entity === entity &&
          entry.change.kind === 'settings' &&
          entry.change.label === label &&
          !this.sync.isRemoved(entry.commit.id),
      );
  }
  private async stored(): Promise<CallLogValue[]> {
    return Promise.all(
      this.entries().map(async (entry) =>
        parseCallLog(await this.sync.open(entry.commit.id)),
      ),
    );
  }
  async missed(): Promise<MissedCall[]> {
    return visibleMissedCalls(
      mergeCallLogs([...(await this.stored()), this.pending], Date.now()),
    );
  }
  /** Saves the merged log with every current version as parent, resolving conflicts. */
  private async write(change: Partial<CallLogValue>): Promise<void> {
    const now = Date.now();
    this.pending = mergeCallLogs(
      [this.pending, { ...emptyCallLog(), ...change }],
      now,
    );
    const parents = this.entries().map((entry) => entry.commit.id);
    const value = mergeCallLogs([...(await this.stored()), this.pending], now);
    await this.sync.save({
      change: { version: 1, entity, kind: 'settings', parents, label },
      value: JSON.stringify(value),
    });
    this.pending = emptyCallLog();
  }
  recordMissed(call: MissedCall): Promise<void> {
    return this.write({ missed: [call] });
  }
  recordAnswered(id: string): Promise<void> {
    return this.write({ answered: [{ id, at: Date.now() }] });
  }
  clear(): Promise<void> {
    return this.write({ clearedAt: Date.now() });
  }
  reset(): void {
    this.pending = emptyCallLog();
  }
}
