import { keys, object } from '../account/index.ts';
import { integer } from '../vault/index.ts';

export const voiceRate = 16000;
export const voiceSeconds = 90;
export const voiceSamples = voiceRate * voiceSeconds;
export interface VoiceMetadata {
  samples: number;
  sampleRate: typeof voiceRate;
}
export function voiceMetadata(input: unknown): VoiceMetadata {
  const row = object(input);
  keys(row, ['samples', 'sampleRate']);
  const samples = integer(row['samples'], voiceSamples);
  if (!samples || row['sampleRate'] !== voiceRate)
    throw new Error('Duração ou formato da mensagem de voz inválido.');
  return { samples, sampleRate: voiceRate };
}
export function voiceDuration(voice: VoiceMetadata): string {
  const seconds = Math.ceil(voice.samples / voice.sampleRate);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
/** Only canonical mono PCM16 WAV, with no ancillary metadata, is played inline. */
export function validateVoice(
  bytes: Uint8Array,
  metadata: VoiceMetadata,
): void {
  const voice = voiceMetadata(metadata);
  if (bytes.length !== 44 + voice.samples * 2)
    throw new Error('Tamanho da mensagem de voz divergente.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const text = (offset: number, length: number) =>
    new TextDecoder().decode(bytes.subarray(offset, offset + length));
  const fields = [
    text(0, 4) === 'RIFF',
    text(8, 8) === 'WAVEfmt ',
    text(36, 4) === 'data',
    view.getUint32(4, true) === bytes.length - 8,
    view.getUint32(16, true) === 16,
    view.getUint16(20, true) === 1,
    view.getUint16(22, true) === 1,
    view.getUint32(24, true) === voiceRate,
    view.getUint32(28, true) === voiceRate * 2,
    view.getUint16(32, true) === 2,
    view.getUint16(34, true) === 16,
    view.getUint32(40, true) === bytes.length - 44,
  ];
  if (!fields.every(Boolean))
    throw new Error('Formato da mensagem de voz não permitido.');
}
