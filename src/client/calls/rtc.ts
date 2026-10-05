import { leaseMs, relaySdp } from '../../shared/calls/index.ts';
import type { MediaState } from '../../shared/calls/index.ts';
import { object } from '../../shared/account/index.ts';

export function iceConfiguration(input: unknown): RTCConfiguration {
  const data = object(input),
    servers = data['iceServers'];
  if (!Array.isArray(servers) || servers.length !== 1)
    throw new Error('TURN próprio indisponível.');
  const server = object(servers[0]),
    urls = server['urls'];
  if (!Array.isArray(urls) || !urls.length || urls.length > 4)
    throw new Error('TURN inválido.');
  const checked: unknown[] = urls;
  if (
    checked.some(
      (url) =>
        typeof url !== 'string' ||
        !/^turns?:[a-zA-Z0-9.-]+:\d{2,5}\?transport=(?:udp|tcp)$/u.test(url),
    )
  )
    throw new Error('Endpoint fora do TURN rejeitado.');
  if (
    typeof server['username'] !== 'string' ||
    typeof server['credential'] !== 'string'
  )
    throw new Error('Credencial TURN ausente.');
  return {
    iceServers: [
      {
        urls: checked as string[],
        username: server['username'],
        credential: server['credential'],
      },
    ],
    iceTransportPolicy: 'relay',
    bundlePolicy: 'max-bundle',
    rtcpMuxPolicy: 'require',
    iceCandidatePoolSize: 0,
  };
}
export class VoiceConnection {
  private pc: RTCPeerConnection | null = null;
  private microphone: MediaStream | null = null;
  private readonly audio: HTMLAudioElement;
  private generation = 0;
  private readonly changed: (state: MediaState) => void;
  private readonly failed: (notice: string) => void;
  private readonly autoplay: () => void;
  private readonly abort = new AbortController();
  state: MediaState = 'idle';
  muted = false;
  constructor(options: {
    changed: (state: MediaState) => void;
    failed: (notice: string) => void;
    autoplay: () => void;
  }) {
    this.changed = options.changed;
    this.failed = options.failed;
    this.autoplay = options.autoplay;
    this.audio = document.createElement('audio');
    this.audio.autoplay = true;
    this.audio.setAttribute('playsinline', '');
  }
  async acquire(): Promise<void> {
    const g = this.generation;
    if (
      !navigator.mediaDevices?.getUserMedia ||
      typeof RTCPeerConnection === 'undefined'
    )
      throw new Error(
        'Este navegador não permite chamadas de voz. Abra em HTTPS e permita o microfone.',
      );
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: false,
    });
    if (g !== this.generation) {
      for (const track of stream.getTracks()) track.stop();
      throw new Error('Chamada cancelada.');
    }
    this.microphone = stream;
    for (const track of stream.getTracks())
      track.addEventListener(
        'ended',
        () => this.failed('O sistema interrompeu o microfone.'),
        { signal: this.abort.signal },
      );
  }
  create(configuration: RTCConfiguration): void {
    if (!this.microphone) throw new Error('Microfone não autorizado.');
    this.pc = new RTCPeerConnection({
      ...configuration,
      iceTransportPolicy: 'relay',
    });
    for (const track of this.microphone.getAudioTracks())
      this.pc.addTrack(track, this.microphone);
    this.pc.addEventListener(
      'track',
      (event) => {
        if (event.track.kind !== 'audio') {
          this.failed('Mídia não permitida.');
          return;
        }
        this.audio.srcObject = new MediaStream([event.track]);
        void this.play();
      },
      { signal: this.abort.signal },
    );
    this.pc.addEventListener(
      'connectionstatechange',
      () => this.connectionState(),
      { signal: this.abort.signal },
    );
    this.update('connecting');
  }
  configure(configuration: RTCConfiguration): void {
    this.require().setConfiguration({
      ...configuration,
      iceTransportPolicy: 'relay',
    });
  }
  private update(state: MediaState): void {
    this.state = state;
    this.changed(state);
  }
  private connectionState(): void {
    const state = this.pc?.connectionState;
    if (state === 'connected') {
      const g = this.generation;
      void this.verifyRelay()
        .then(() => {
          if (g === this.generation) this.update('connected');
        })
        .catch(() => {
          if (g === this.generation)
            this.failed(
              'O caminho de mídia não confirmou TURN nos dois extremos.',
            );
        });
    } else if (state === 'failed' || state === 'disconnected')
      this.update('disconnected');
  }
  async verifyRelay(): Promise<void> {
    if (!this.pc || this.pc.getConfiguration().iceTransportPolicy !== 'relay')
      throw new Error('Política relay ausente.');
    const stats = await this.pc.getStats();
    const pairs: Record<string, unknown>[] = [];
    stats.forEach((stat: Record<string, unknown>) => {
      if (
        stat['type'] === 'transport' &&
        typeof stat['selectedCandidatePairId'] === 'string'
      ) {
        const pair: unknown = stats.get(stat['selectedCandidatePairId']);
        pairs.push(object(pair));
      }
    });
    if (!pairs.length) throw new Error('Caminho selecionado ausente.');
    for (const pair of pairs) {
      const local: unknown = stats.get(String(pair['localCandidateId']));
      const remote: unknown = stats.get(String(pair['remoteCandidateId']));
      if (
        object(local)['candidateType'] !== 'relay' ||
        object(remote)['candidateType'] !== 'relay'
      )
        throw new Error('Conexão direta rejeitada.');
    }
  }
  async offer(restart = false): Promise<string> {
    const pc = this.require();
    if (restart) pc.restartIce();
    await pc.setLocalDescription(await pc.createOffer({ iceRestart: restart }));
    return this.gather(pc);
  }
  async answer(sdp: string): Promise<string> {
    const pc = this.require();
    await pc.setRemoteDescription({ type: 'offer', sdp: relaySdp(sdp) });
    await pc.setLocalDescription(await pc.createAnswer());
    return this.gather(pc);
  }
  async accept(sdp: string): Promise<void> {
    await this.require().setRemoteDescription({
      type: 'answer',
      sdp: relaySdp(sdp),
    });
  }
  private require(): RTCPeerConnection {
    if (!this.pc) throw new Error('Conexão encerrada.');
    return this.pc;
  }
  private async gather(pc: RTCPeerConnection): Promise<string> {
    const g = this.generation;
    const until = Date.now() + Math.min(10_000, leaseMs);
    const started = Date.now();
    while (pc.iceGatheringState !== 'complete') {
      if (g !== this.generation || Date.now() > until)
        throw new Error('TURN não respondeu a tempo.');
      // Some unreachable interfaces keep gathering alive after a working TURN
      // allocation exists. Share only the bounded relay snapshot, without trickle.
      if (
        Date.now() - started >= 2000 &&
        pc.localDescription?.sdp.includes(' typ relay')
      )
        break;
      await new Promise<void>((resolve) => setTimeout(resolve, 100));
    }
    if (g !== this.generation) throw new Error('Chamada encerrada.');
    return relaySdp(pc.localDescription?.sdp);
  }
  mute(): void {
    this.muted = !this.muted;
    for (const track of this.microphone?.getAudioTracks() ?? [])
      track.enabled = !this.muted;
  }
  async play(): Promise<void> {
    const g = this.generation;
    try {
      await this.audio.play();
    } catch {
      if (g === this.generation) this.autoplay();
    }
  }
  close(): void {
    this.generation++;
    this.abort.abort();
    this.pc?.close();
    this.pc = null;
    for (const track of this.microphone?.getTracks() ?? []) track.stop();
    this.microphone = null;
    this.audio.pause();
    this.audio.srcObject = null;
    this.audio.remove();
    this.state = 'idle';
  }
}
