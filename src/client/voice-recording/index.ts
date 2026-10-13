import { t, translatedError } from '../../shared/i18n/index.ts';
import type { VoiceMetadata } from '../../shared/voice/index.ts';
import { voiceRate, voiceSamples } from '../../shared/voice/index.ts';
import { voiceWav } from '../voice-audio/index.ts';
import type { AttachmentSelection } from '../attachments/index.ts';
import { BrowserCapture } from './capture.ts';
import type { CaptureFactory, VoiceCapture } from './types.ts';
export type { CaptureFactory, VoiceCapture, CaptureEvents } from './types.ts';
export interface RecordingState {
  phase: 'idle' | 'requesting' | 'recording' | 'stopping';
  samples: number;
  notice: string;
}
export class VoiceRecording {
  private readonly changed: (state: RecordingState) => void;
  private readonly completed: (selection: AttachmentSelection) => void;
  private readonly factory: CaptureFactory;
  private capture: VoiceCapture | null = null;
  private chunks: Int16Array[] = [];
  private samples = 0;
  private generation = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private started = 0;
  private lastChunk = 0;
  state: RecordingState = { phase: 'idle', samples: 0, notice: '' };
  constructor(options: {
    changed: (state: RecordingState) => void;
    completed: (selection: AttachmentSelection) => void;
    factory?: CaptureFactory;
  }) {
    this.changed = options.changed;
    this.completed = options.completed;
    this.factory = options.factory ?? ((events) => new BrowserCapture(events));
  }
  get active(): boolean {
    return this.state.phase !== 'idle';
  }
  private update(phase: RecordingState['phase'], notice: string): void {
    this.state = { phase, samples: this.samples, notice };
    this.changed(this.state);
  }
  async start(): Promise<void> {
    if (this.active) return;
    this.cancel();
    const generation = this.generation;
    this.update(
      'requesting',
      t('Autorize o microfone. A gravação começa após a permissão.'),
    );
    const capture = this.factory({
      chunk: (chunk) => this.receive(chunk, generation),
      ended: () => {
        if (generation === this.generation)
          void this.stop(
            t('Gravação concluída; confira a prévia antes de enviar.'),
          );
      },
      interrupted: (notice) => {
        if (generation === this.generation) void this.stop(notice);
      },
    });
    this.capture = capture;
    try {
      await capture.start();
      if (generation !== this.generation || this.state.phase !== 'requesting')
        return;
      this.started = this.lastChunk = Date.now();
      this.update('recording', t('Gravando. Até 90 segundos.'));
      this.timer = setInterval(() => this.watchdog(), 1000);
    } catch (error: unknown) {
      if (generation !== this.generation) return;
      if (this.samples) {
        await this.stop(
          t(
            'A inicialização do microfone foi interrompida. Confira o trecho preservado.',
          ),
        );
        return;
      }
      this.release();
      this.clearChunks();
      this.update(
        'idle',
        error instanceof Error
          ? t('Gravação não iniciada: {0}', [translatedError(error.message)])
          : t('Gravação não iniciada. Confira a permissão do microfone.'),
      );
    }
  }
  private receive(chunk: Int16Array, generation: number): void {
    if (generation !== this.generation || !this.active) {
      chunk.fill(0);
      return;
    }
    if (
      !chunk.length ||
      chunk.length > 4000 ||
      this.samples + chunk.length > voiceSamples
    ) {
      chunk.fill(0);
      void this.stop(
        t(
          'O microfone enviou dados fora do limite. Confira o trecho preservado.',
        ),
      );
      return;
    }
    this.chunks.push(chunk);
    this.samples += chunk.length;
    this.lastChunk = Date.now();
    this.update(this.state.phase, this.state.notice);
    if (this.samples === voiceSamples)
      void this.stop(
        t('Limite de 90 segundos atingido. Confira a prévia antes de enviar.'),
      );
  }
  private watchdog(): void {
    if (Date.now() - this.started >= 95000)
      void this.stop(
        t('Limite de gravação atingido. Confira o trecho preservado.'),
      );
    else if (Date.now() - this.lastChunk > 5000)
      void this.stop(
        t('O microfone parou de produzir áudio. Confira o trecho preservado.'),
      );
  }
  /** A deliberate stop needs no notice; the preview itself is the review. */
  async stop(notice = ''): Promise<void> {
    if (!this.active || this.state.phase === 'stopping') return;
    if (this.state.phase === 'requesting' && !this.samples) {
      this.cancel();
      this.update(
        'idle',
        t('Pedido de microfone cancelado. Nenhum áudio enviado.'),
      );
      return;
    }
    const generation = this.generation;
    this.update('stopping', notice);
    try {
      notice = await this.finishCapture(notice);
      if (generation !== this.generation) return;
      this.release();
      this.complete(notice);
    } catch (error: unknown) {
      if (generation === this.generation) {
        this.fail(error);
      }
    } finally {
      if (generation === this.generation) this.clearChunks();
    }
  }
  private fail(error: unknown): void {
    this.release();
    this.update(
      'idle',
      error instanceof Error
        ? translatedError(error.message)
        : t('Não foi possível preparar a gravação.'),
    );
  }
  private async finishCapture(notice: string): Promise<string> {
    try {
      await this.capture?.stop();
      return notice;
    } catch {
      return t(
        'O microfone não encerrou normalmente. Confira o trecho capturado que foi preservado.',
      );
    }
  }
  private complete(notice: string): void {
    if (!this.samples) {
      this.update('idle', t('Nenhum áudio capturado. Tente novamente.'));
      return;
    }
    const bytes = voiceWav(this.chunks),
      voice: VoiceMetadata = { samples: this.samples, sampleRate: voiceRate };
    this.completed({
      bytes,
      voice,
      name: 'voice-message.wav',
      type: 'audio/wav',
      image: false,
      thumbnail: null,
    });
    this.update(
      'idle',
      notice
        ? t('{0} Nenhum áudio foi enviado automaticamente.', [notice])
        : '',
    );
  }
  cancel(): void {
    const hadRecording = this.active;
    this.generation++;
    this.release();
    this.clearChunks();
    this.update(
      'idle',
      hadRecording ? t('Gravação cancelada. Nenhum áudio enviado.') : '',
    );
  }
  private release(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.capture?.close();
    this.capture = null;
  }
  private clearChunks(): void {
    for (const chunk of this.chunks) chunk.fill(0);
    this.chunks = [];
    this.samples = 0;
  }
}
