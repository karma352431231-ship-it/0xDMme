import {
  voiceRate,
  voiceSamples,
  validateVoice,
} from '../../shared/voice/index.ts';

/** Integrate input samples into 16 kHz intervals. State spans callback boundaries;
 * no whole device-rate recording is kept in memory. */
export class VoicePcm {
  private readonly interval: number;
  private remaining: number;
  private sum = 0;
  private chunk = new Int16Array(4000);
  private position = 0;
  samples = 0;
  constructor(sampleRate: number) {
    if (!Number.isFinite(sampleRate) || sampleRate < 8000 || sampleRate > 96000)
      throw new Error('Frequência do microfone não suportada.');
    this.interval = sampleRate / voiceRate;
    this.remaining = this.interval;
  }
  get full(): boolean {
    return this.samples >= voiceSamples;
  }
  append(input: Float32Array, emit: (chunk: Int16Array) => void): void {
    for (const sample of input) {
      if (this.full) return;
      if (!Number.isFinite(sample))
        throw new Error('Amostra de áudio inválida.');
      this.sample(Math.max(-1, Math.min(1, sample)), emit);
    }
  }
  private sample(sample: number, emit: (chunk: Int16Array) => void): void {
    let available = 1;
    while (available > 1e-8 && !this.full) {
      const weight = Math.min(available, this.remaining);
      this.sum += sample * weight;
      this.remaining -= weight;
      available -= weight;
      if (this.remaining < 1e-8) {
        const value = this.sum / this.interval;
        this.chunk[this.position++] = Math.round(
          value * (value < 0 ? 32768 : 32767),
        );
        this.samples++;
        this.remaining = this.interval;
        this.sum = 0;
        if (this.position === this.chunk.length) this.flush(emit);
      }
    }
  }
  flush(emit: (chunk: Int16Array) => void): void {
    if (!this.position) return;
    const result = this.chunk.slice(0, this.position);
    this.chunk.fill(0);
    this.position = 0;
    emit(result);
  }
}
export function voiceWav(
  chunks: readonly Int16Array[],
): Uint8Array<ArrayBuffer> {
  const samples = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  if (!samples || samples > voiceSamples)
    throw new Error('Gravação vazia ou acima de 90 segundos.');
  const bytes = new Uint8Array(44 + samples * 2),
    view = new DataView(bytes.buffer);
  const text = (offset: number, value: string) =>
    bytes.set(new TextEncoder().encode(value), offset);
  text(0, 'RIFF');
  view.setUint32(4, bytes.length - 8, true);
  text(8, 'WAVEfmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, voiceRate, true);
  view.setUint32(28, voiceRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, 'data');
  view.setUint32(40, samples * 2, true);
  let offset = 44;
  for (const chunk of chunks)
    for (const value of chunk) {
      view.setInt16(offset, value, true);
      offset += 2;
    }
  validateVoice(bytes, { samples, sampleRate: voiceRate });
  return bytes;
}
