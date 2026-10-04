import type { CaptureEvents, VoiceCapture } from './types.ts';
declare const VOICE_WORKLET_URL: string;

function deadline<T>(promise: Promise<T>, milliseconds: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () =>
        reject(
          new Error('O microfone não respondeu a tempo. Tente novamente.'),
        ),
      milliseconds,
    );
    void promise.then(resolve, reject).finally(() => clearTimeout(timer));
  });
}
/** Browser resources belong to one recording. Late permission answers are closed. */
export class BrowserCapture implements VoiceCapture {
  private readonly events: CaptureEvents;
  private closed = false;
  private context: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private node: AudioWorkletNode | null = null;
  private finish: (() => void) | null = null;
  private stopPromise: Promise<void> | null = null;
  constructor(events: CaptureEvents) {
    this.events = events;
  }
  async start(): Promise<void> {
    if (
      !navigator.mediaDevices?.getUserMedia ||
      typeof AudioWorkletNode === 'undefined'
    )
      throw new Error(
        'Gravação de voz indisponível neste navegador. Use uma versão atual em HTTPS.',
      );
    // Construct/resume synchronously from the record button's gesture (including iOS).
    const context = new AudioContext({ latencyHint: 'interactive' });
    this.context = context;
    const resumed = context.resume();
    // Observe rejection immediately while the microphone prompt is open.
    void resumed.catch(() => {});
    const requested = navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1 },
      video: false,
    });
    void requested.then(
      (stream) => {
        if (this.closed) stream.getTracks().forEach((track) => track.stop());
        else this.stream = stream;
      },
      () => {},
    );
    const stream = await deadline(requested, 20000);
    if (this.closed) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }
    this.stream = stream;
    await deadline(context.audioWorklet.addModule(VOICE_WORKLET_URL), 10000);
    if (this.closed) return;
    const node = new AudioWorkletNode(context, '0xdmme-voice', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [1],
      channelCount: 1,
      channelCountMode: 'explicit',
      channelInterpretation: 'speakers',
    });
    this.node = node;
    node.port.onmessage = (event: MessageEvent<unknown>) =>
      this.receive(event.data);
    node.onprocessorerror = () =>
      this.interrupt('O processamento do microfone foi interrompido.');
    for (const track of stream.getAudioTracks()) {
      track.addEventListener(
        'ended',
        () => this.interrupt('O microfone foi desconectado.'),
        { once: true },
      );
      track.addEventListener(
        'mute',
        () => this.interrupt('O sistema interrompeu o microfone.'),
        { once: true },
      );
    }
    this.source = context.createMediaStreamSource(stream);
    this.source.connect(node);
    // The processor leaves output silent: the user's microphone is never monitored.
    node.connect(context.destination);
    await deadline(resumed, 5000);
    if (this.closed) return;
    await deadline(context.resume(), 5000);
    if (context.state !== 'running')
      throw new Error('O navegador não liberou a gravação. Tente novamente.');
    context.onstatechange = () => {
      if (context.state !== 'running')
        this.interrupt('O navegador suspendeu o microfone.');
    };
  }
  private receive(value: unknown): void {
    if (this.closed || !value || typeof value !== 'object') return;
    if ('chunk' in value && value.chunk instanceof Int16Array)
      this.events.chunk(value.chunk);
    if ('ended' in value && value.ended === true) {
      this.finish?.();
      this.events.ended();
    }
  }
  private interrupt(notice: string): void {
    if (!this.closed) this.events.interrupted(notice);
  }
  stop(): Promise<void> {
    if (this.stopPromise) return this.stopPromise;
    if (this.closed || !this.node) return Promise.resolve();
    this.stopPromise = new Promise((resolve) => {
      const timer = setTimeout(resolve, 1500);
      this.finish = () => {
        clearTimeout(timer);
        resolve();
      };
      this.node?.port.postMessage('stop');
    });
    return this.stopPromise;
  }
  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.finish?.();
    this.finish = null;
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    this.source?.disconnect();
    this.source = null;
    this.node?.disconnect();
    this.node?.port.close();
    this.node = null;
    const context = this.context;
    this.context = null;
    if (context) {
      context.onstatechange = null;
      void context
        .close()
        .catch(() =>
          this.events.interrupted(
            'Não foi possível encerrar o contexto do microfone.',
          ),
        );
    }
  }
}
