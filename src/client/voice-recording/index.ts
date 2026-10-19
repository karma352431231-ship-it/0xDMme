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
      t(
        'Allow microphone access. Recording starts after permission is granted.',
      ),
    );
    const capture = this.factory({
      chunk: (chunk) => this.receive(chunk, generation),
      ended: () => {
        if (generation === this.generation)
          void this.stop(
            t('Recording complete; check the preview before sending.'),
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
      this.update('recording', t('Recording. Up to 90 seconds.'));
      this.timer = setInterval(() => this.watchdog(), 1000);
    } catch (error: unknown) {
      if (generation !== this.generation) return;
      if (this.samples) {
        await this.stop(
          t(
            'Microphone initialization was interrupted. Check the preserved excerpt.',
          ),
        );
        return;
      }
      this.release();
      this.clearChunks();
      this.update(
        'idle',
        error instanceof Error
          ? t('Recording not started: {0}', [translatedError(error.message)])
          : t('Recording not started. Check microphone permission.'),
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
          'The microphone sent data beyond the limit. Check the preserved excerpt.',
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
        t('90-second limit reached. Check the preview before sending.'),
      );
  }
  private watchdog(): void {
    if (Date.now() - this.started >= 95000)
      void this.stop(
        t('Recording limit reached. Check the preserved excerpt.'),
      );
    else if (Date.now() - this.lastChunk > 5000)
      void this.stop(
        t(
          'The microphone stopped producing audio. Check the preserved excerpt.',
        ),
      );
  }
  /** A deliberate stop needs no notice; the preview itself is the review. */
  async stop(notice = ''): Promise<void> {
    if (!this.active || this.state.phase === 'stopping') return;
    if (this.state.phase === 'requesting' && !this.samples) {
      this.cancel();
      this.update('idle', t('Microphone request cancelled. No audio sent.'));
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
        : t('Could not prepare the recording.'),
    );
  }
  private async finishCapture(notice: string): Promise<string> {
    try {
      await this.capture?.stop();
      return notice;
    } catch {
      return t(
        'The microphone did not stop normally. Check the captured excerpt that was preserved.',
      );
    }
  }
  private complete(notice: string): void {
    if (!this.samples) {
      this.update('idle', t('No audio captured. Try again.'));
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
      notice ? t('{0} No audio was sent automatically.', [notice]) : '',
    );
  }
  cancel(): void {
    const hadRecording = this.active;
    this.generation++;
    this.release();
    this.clearChunks();
    this.update(
      'idle',
      hadRecording ? t('Recording cancelled. No audio sent.') : '',
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
