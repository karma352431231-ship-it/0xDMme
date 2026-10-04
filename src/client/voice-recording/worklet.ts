import { VoicePcm } from '../voice-audio/index.ts';
declare const sampleRate: number;
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
}
declare function registerProcessor(
  name: string,
  constructor: typeof AudioWorkletProcessor,
): void;

class VoiceProcessor extends AudioWorkletProcessor {
  private readonly pcm = new VoicePcm(sampleRate);
  private ended = false;
  constructor() {
    super();
    this.port.onmessage = (event: MessageEvent<unknown>) => {
      if (event.data === 'stop') this.finish();
    };
  }
  private emit(chunk: Int16Array): void {
    this.port.postMessage({ chunk }, [chunk.buffer]);
  }
  private finish(): void {
    if (this.ended) return;
    this.ended = true;
    this.pcm.flush((chunk) => this.emit(chunk));
    this.port.postMessage({ ended: true, limited: this.pcm.full });
  }
  process(inputs: Float32Array[][]): boolean {
    if (this.ended) return false;
    const input = inputs[0]?.[0];
    if (input) this.pcm.append(input, (chunk) => this.emit(chunk));
    if (this.pcm.full) this.finish();
    return !this.ended;
  }
}
registerProcessor('0xdmme-voice', VoiceProcessor);
