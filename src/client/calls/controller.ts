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
import type { VaultSync } from '../vault-sync/index.ts';
import type { VoicePlayback } from '../voice-playback/index.ts';
import { CallTransport } from './transport.ts';
import { CallSecurity } from './security.ts';
import { VoiceConnection, iceConfiguration } from './rtc.ts';

export interface CallUiState {
  call: CallView | null;
  notice: string;
  busy: boolean;
  muted: boolean;
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
  private notice = 'Chamadas: entre e autorize este aparelho.';
  private settledNotice = false;
  private generation = 0;
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
    this.clear('Chamadas: entre e autorize este aparelho.');
    this.transport.reset();
    this.security.clear();
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
  private guard(g: number): void {
    if (g !== this.generation || !this.session)
      throw new Error('Chamada encerrada.');
  }
  private render(): void {
    this.publish({
      call: this.call,
      notice: this.notice,
      busy: this.busy || (this.polling && this.call !== null),
      muted: this.rtc?.muted ?? false,
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
          this.notice = 'Chamada conectada · voz criptografada.';
        }
        if (state === 'disconnected') {
          this.recovery ||= Date.now();
          this.notice = 'Reconectando pelo TURN…';
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
        this.notice = 'Encerre a chamada atual primeiro.';
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
      this.notice = 'Chamando…';
      this.render();
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
      await this.sendAnswer(description, g);
      this.guard(g);
      this.notice = 'Conectando…';
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
          ? error.message
          : 'Pare a gravação de voz antes de usar o microfone.';
      return false;
    }
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
      // Count conservatively from request start, including signing/network time.
      // Both participants expire without adding another polling interval.
      this.authorizationUntil = this.snapshot.call
        ? requested + this.snapshot.call.authorizedFor
        : 0;
      this.lastLease = Date.now();
      if (!this.busy) await this.applySnapshot(g);
    } catch (error: unknown) {
      this.pollError(error, g);
    } finally {
      this.polling = false;
      this.render();
      this.schedule();
    }
  }
  private pollError(error: unknown, g: number): void {
    if (g !== this.generation) return;
    if (
      error instanceof AccountError &&
      [401, 403, 409].includes(error.status)
    ) {
      this.clear(
        this.active
          ? 'Chamada encerrada: autorização indisponível.'
          : error.message,
      );
      return;
    }
    if (!this.active)
      this.notice =
        error instanceof Error
          ? error.message
          : 'Chamadas indisponíveis agora.';
  }
  private async applySnapshot(g: number): Promise<void> {
    const next = this.snapshot.call;
    if (!next) {
      this.idleSnapshot();
      return;
    }
    if (this.call && this.call.id !== next.id)
      throw new Error('Estado da chamada divergente.');
    if (next.signal && next.sequence > this.ack) {
      const description = await this.description(next, g);
      this.verified = description;
      if (!this.call) {
        this.call = next;
        this.notice = 'Chamada de voz recebida.';
      }
      await this.receive(next, description, g);
    }
    if (this.call) this.call = next;
    this.connectingDeadline(next);
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
      this.clear('Chamada encerrada ou indisponível.');
      return;
    }
    if (this.settledNotice) return;
    this.notice = this.snapshot.configured
      ? 'Chamadas disponíveis com o app aberto.'
      : 'Chamadas aguardam a configuração do TURN próprio.';
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
      this.notice = 'Reconectando pelo TURN…';
    }
  }
  private async description(
    view: CallView,
    g: number,
  ): Promise<CallDescription> {
    if (
      this.verified?.id === view.id &&
      this.verified.sequence === view.sequence
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
      this.clear('Chamada rejeitada: identidade ou negociação inválida.');
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
      this.snapshot.configured ? pollMs : 30_000,
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
      void this.end('Não foi possível reconectar em 20 segundos.');
      return;
    }
    if (this.call?.deadline && this.call.deadline <= Date.now()) {
      void this.end('Chamada encerrada ou indisponível.');
      return;
    }
    this.maybeRestart();
    this.render();
  }
  private expiredAuthorization(): string | null {
    const now = Date.now();
    if (this.lastLease && now - this.lastLease >= leaseMs)
      return 'Chamada encerrada: conexão com o servidor perdida.';
    if (this.authorizationUntil && now >= this.authorizationUntil)
      return 'Chamada encerrada: autorização indisponível.';
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
        await this.end('Chamada encerrada: autorização mudou.');
      else {
        this.notice = 'Reconectando pelo TURN…';
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
            ? error.message
            : 'Não foi possível iniciar a chamada.',
        );
    } finally {
      if (g === this.generation) this.busy = false;
      this.render();
      this.ready();
    }
  }
  async end(notice = 'Chamada encerrada.'): Promise<void> {
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
      if (closed === this.generation && notice === 'Chamada encerrada.') {
        this.notice =
          'Áudio encerrado neste aparelho. Sem confirmação do servidor; o outro lado encerra em até 20 segundos.';
        this.render();
      }
    }
  }
  private clear(notice: string): void {
    this.generation++;
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
  async configure(enabled: boolean): Promise<void> {
    await this.run(async (g) => {
      await this.transport.request('configure', {
        enabled,
        revision: this.snapshot.revision,
      });
      this.guard(g);
      this.snapshot.enabled = enabled;
      this.notice = enabled
        ? 'Recebimento de chamadas ativado.'
        : 'Recebimento de chamadas desativado.';
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
