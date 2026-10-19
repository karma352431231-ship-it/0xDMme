import { sendCallTestTone } from './test-tone.ts';
import { t } from '../../shared/i18n/index.ts';
import { leaseMs, relaySdp } from '../../shared/calls/index.ts';
import type { MediaState } from '../../shared/calls/index.ts';
import { object } from '../../shared/account/index.ts';
import { inspectCallAudio, observeCallOutput } from './audio-diagnostics.ts';

export function iceConfiguration(input: unknown): RTCConfiguration {
  const data = object(input),
    servers = data['iceServers'];
  if (!Array.isArray(servers) || servers.length !== 1)
    throw new Error("App's own TURN server unavailable.");
  const server = object(servers[0]),
    urls = server['urls'];
  if (!Array.isArray(urls) || !urls.length || urls.length > 4)
    throw new Error('Invalid TURN.');
  const checked: unknown[] = urls;
  if (
    checked.some(
      (url) =>
        typeof url !== 'string' ||
        !/^turns?:[a-zA-Z0-9.-]+:\d{2,5}\?transport=(?:udp|tcp)$/u.test(url),
    )
  )
    throw new Error('Non-TURN endpoint rejected.');
  if (
    typeof server['username'] !== 'string' ||
    typeof server['credential'] !== 'string'
  )
    throw new Error('TURN credential missing.');
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
function hasLocalRelay(pc: RTCPeerConnection): boolean {
  return pc.localDescription?.sdp.includes(' typ relay') ?? false;
}

async function detachCapture(pc: RTCPeerConnection): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error('Capture release timed out.')),
      1500,
    );
  });
  try {
    await Promise.race([
      Promise.all(
        pc
          .getSenders()
          .filter((sender) => sender.track?.kind === 'audio')
          .map((sender) => sender.replaceTrack(null)),
      ),
      deadline,
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export class VoiceConnection {
  private pc: RTCPeerConnection | null = null;
  private microphone: MediaStream | null = null;
  private readonly audio: HTMLAudioElement;
  private generation = 0;
  private releaseObservation: (() => void) | null = null;
  private readonly changed: (state: MediaState) => void;
  private readonly failed: (notice: string) => void;
  private readonly autoplay: () => void;
  private readonly abort = new AbortController();
  state: MediaState = 'idle';
  muted = false;
  captureStopped = false;
  private testTone: AbortController | null = null;
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
        'This browser cannot make voice calls. Open over HTTPS and allow microphone access.',
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
      throw new Error('Call cancelled.');
    }
    this.microphone = stream;
    for (const track of stream.getTracks())
      track.addEventListener(
        'ended',
        () => this.failed(t('The system interrupted the microphone.')),
        { signal: this.abort.signal },
      );
  }
  create(configuration: RTCConfiguration): void {
    if (!this.microphone) throw new Error('Microphone not authorized.');
    this.pc = new RTCPeerConnection({
      ...configuration,
      iceTransportPolicy: 'relay',
    });
    this.releaseObservation = observeCallOutput(this.pc, this.audio);
    for (const track of this.microphone.getAudioTracks())
      this.pc.addTrack(track, this.microphone);
    this.pc.addEventListener(
      'track',
      (event) => {
        if (event.track.kind !== 'audio') {
          this.failed(t('Media not allowed.'));
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
              t('The media path did not confirm TURN at both endpoints.'),
            );
        });
    } else if (state === 'failed' || state === 'disconnected')
      this.update('disconnected');
  }
  async verifyRelay(): Promise<void> {
    if (!this.pc || this.pc.getConfiguration().iceTransportPolicy !== 'relay')
      throw new Error('Relay policy missing.');
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
    if (!pairs.length) throw new Error('Selected path missing.');
    for (const pair of pairs) {
      const local: unknown = stats.get(String(pair['localCandidateId']));
      const remote: unknown = stats.get(String(pair['remoteCandidateId']));
      if (
        object(local)['candidateType'] !== 'relay' ||
        object(remote)['candidateType'] !== 'relay'
      )
        throw new Error('Direct connection rejected.');
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
    if (!this.pc) throw new Error('Connection ended.');
    return this.pc;
  }
  private async gather(pc: RTCPeerConnection): Promise<string> {
    const g = this.generation;
    const until = Date.now() + Math.min(10_000, leaseMs);
    const started = Date.now();
    // Restart may briefly retain the previous generation's complete state.
    // Wait for a relay in the new local description before accepting completion.
    while (pc.iceGatheringState !== 'complete' || !hasLocalRelay(pc)) {
      if (g !== this.generation || Date.now() > until)
        throw new Error('TURN did not respond in time.');
      // Some unreachable interfaces keep gathering alive after a working TURN
      // allocation exists. Share only the bounded relay snapshot, without trickle.
      if (Date.now() - started >= 2000 && hasLocalRelay(pc)) break;
      await new Promise<void>((resolve) => setTimeout(resolve, 100));
    }
    if (g !== this.generation) throw new Error('Call ended.');
    return relaySdp(pc.localDescription?.sdp);
  }
  async inspectAudio() {
    const pc = this.require(),
      microphone = this.microphone,
      g = this.generation;
    if (!microphone) throw new Error('Microphone not authorized.');
    return inspectCallAudio({
      pc,
      microphone,
      audio: this.audio,
      guard: () => {
        if (g !== this.generation) throw new Error('Call ended.');
      },
    });
  }
  async sendTestTone(): Promise<void> {
    const pc = this.require(),
      g = this.generation,
      sender = pc.getSenders()[0];
    if (this.testTone || !sender || this.captureStopped || this.muted)
      throw new Error('Test tone unavailable.');
    const abort = new AbortController();
    this.testTone = abort;
    try {
      await sendCallTestTone(sender, abort.signal);
    } catch (error: unknown) {
      if (g === this.generation && error !== abort.signal.reason)
        this.failed(t('calls.test-tone-failed'));
      throw error;
    } finally {
      if (this.testTone === abort) this.testTone = null;
    }
  }
  /** Explicit diagnostic: keep receiving, release capture until this call ends. */
  async stopCaptureForInspection(): Promise<void> {
    const pc = this.require(),
      g = this.generation;
    if (this.captureStopped) return;
    this.testTone?.abort();
    this.captureStopped = true;
    this.muted = true;
    for (const track of this.microphone?.getAudioTracks() ?? []) track.stop();
    await detachCapture(pc);
    if (g !== this.generation) throw new Error('Call ended.');
  }
  mute(): void {
    if (this.captureStopped) return;
    this.testTone?.abort();
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
    this.testTone?.abort();
    this.generation++;
    this.abort.abort();
    this.pc?.close();
    this.releaseObservation?.();
    this.releaseObservation = null;
    this.pc = null;
    for (const track of this.microphone?.getTracks() ?? []) track.stop();
    this.microphone = null;
    this.audio.pause();
    this.audio.srcObject = null;
    this.audio.remove();
    this.state = 'idle';
  }
}
