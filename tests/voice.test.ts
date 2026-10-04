import { sealFile, openFile } from '../src/client/attachment-crypto/index.ts';
import { attachmentContent } from '../src/shared/attachments/index.ts';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { VoicePcm, voiceWav } from '../src/client/voice-audio/index.ts';
import { VoiceRecording } from '../src/client/voice-recording/index.ts';
import type {
  CaptureEvents,
  VoiceCapture,
} from '../src/client/voice-recording/index.ts';
import type { AttachmentSelection } from '../src/client/attachments/index.ts';
import {
  validateVoice,
  voiceMetadata,
  voiceRate,
  voiceSamples,
} from '../src/shared/voice/index.ts';

function pcm(rate: number, input: Float32Array, size: number): Int16Array {
  const converter = new VoicePcm(rate),
    chunks: Int16Array[] = [];
  for (let offset = 0; offset < input.length; offset += size)
    converter.append(input.subarray(offset, offset + size), (chunk) =>
      chunks.push(chunk),
    );
  converter.flush((chunk) => chunks.push(chunk));
  return Int16Array.from(chunks.flatMap((chunk) => [...chunk]));
}
await test('PCM mantém duração e amostras ao dividir callbacks de 44,1/48/96 kHz; satura sem overflow', () => {
  for (const rate of [8000, 16000, 44100, 48000, 96000]) {
    const input = Float32Array.from(
      { length: rate },
      (_, i) => Math.sin(i * 0.02) * 1.4,
    );
    const whole = pcm(rate, input, input.length),
      split = pcm(rate, input, 127);
    assert.equal(split.length, voiceRate);
    assert.deepEqual(split, whole);
    assert.ok(split.some((value) => value === 32767));
    assert.ok(split.some((value) => value === -32768));
  }
  assert.throws(() => new VoicePcm(0));
  assert.throws(() => new VoicePcm(192000));
  assert.throws(() => pcm(16000, new Float32Array([NaN]), 1));
});
await test('90 segundos geram WAV canônico abaixo de 3 MB; cabeçalho, duração e dados extras são recusados', () => {
  const converter = new VoicePcm(16000),
    chunks: Int16Array[] = [];
  converter.append(new Float32Array(voiceSamples + 1000).fill(0.25), (chunk) =>
    chunks.push(chunk),
  );
  converter.flush((chunk) => chunks.push(chunk));
  assert.equal(converter.samples, voiceSamples);
  assert.equal(converter.full, true);
  const bytes = voiceWav(chunks),
    meta = voiceMetadata({ samples: voiceSamples, sampleRate: voiceRate });
  assert.equal(bytes.length, 2_880_044);
  validateVoice(bytes, meta);
  for (const offset of [0, 4, 8, 16, 20, 22, 24, 28, 32, 34, 36, 40]) {
    const corrupt = bytes.slice();
    corrupt[offset] = (corrupt[offset] ?? 0) ^ 1;
    assert.throws(() => validateVoice(corrupt, meta));
  }
  assert.throws(() => validateVoice(bytes.subarray(0, bytes.length - 2), meta));
  assert.throws(() => voiceMetadata({ ...meta, samples: voiceSamples + 1 }));
  assert.throws(() => voiceMetadata({ ...meta, sampleRate: 48000 }));
  assert.throws(() => voiceMetadata({ ...meta, name: 'privado' }));
  assert.throws(() => voiceWav([]));
});

class Capture implements VoiceCapture {
  events: CaptureEvents;
  closed = false;
  failure = false;
  waiting: Promise<void> = Promise.resolve();
  constructor(events: CaptureEvents) {
    this.events = events;
  }
  async start(): Promise<void> {
    await this.waiting;
    if (this.failure) throw new Error('Permissão recusada.');
  }
  stop(): Promise<void> {
    this.events.ended();
    return Promise.resolve();
  }
  close(): void {
    this.closed = true;
  }
}
function recording() {
  const devices: Capture[] = [],
    previews: AttachmentSelection[] = [];
  const voice = new VoiceRecording({
    changed: () => {},
    completed: (selection) => previews.push(selection),
    factory: (events) => {
      const capture = new Capture(events);
      devices.push(capture);
      return capture;
    },
  });
  return { voice, devices, previews };
}
await test('parar e interromper preservam trecho para prévia; cancelar apaga PCM sem criar envio', async () => {
  const { voice, devices, previews } = recording();
  await voice.start();
  const first = devices[0];
  assert.ok(first);
  const chunk = new Int16Array(4000).fill(1234);
  first.events.chunk(chunk);
  await voice.stop();
  assert.equal(first.closed, true);
  assert.equal(voice.active, false);
  assert.equal(previews.length, 1);
  assert.equal(previews[0]?.voice?.samples, 4000);
  assert.ok(chunk.every((value) => value === 0));
  await voice.start();
  const second = devices[1];
  assert.ok(second);
  second.events.chunk(new Int16Array(100).fill(456));
  second.events.interrupted('Microfone desconectado.');
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(previews.length, 2);
  assert.match(voice.state.notice, /desconectado/);
  await voice.start();
  const third = devices[2];
  assert.ok(third);
  const cancelled = new Int16Array(100).fill(789);
  third.events.chunk(cancelled);
  voice.cancel();
  assert.equal(third.closed, true);
  assert.equal(previews.length, 2);
  assert.ok(cancelled.every((value) => value === 0));
});
await test('permissão negada e resposta antiga após cancelamento não ressuscitam gravação nem encerram uma nova', async () => {
  const { voice, devices, previews } = recording();
  let finish: (() => void) | undefined;
  const started = voice.start();
  const first = devices[0];
  assert.ok(first);
  // The mock starts in a microtask, like a permission prompt.
  voice.cancel();
  await started;
  assert.equal(first.closed, true);
  await voice.start();
  first.events.chunk(new Int16Array([100]));
  first.events.ended();
  first.events.interrupted('Antigo');
  assert.equal(voice.state.phase, 'recording');
  assert.equal(voice.state.samples, 0);
  voice.cancel();
  const rejected = new VoiceRecording({
    changed: () => {},
    completed: (selection) => previews.push(selection),
    factory: (events) => {
      const capture = new Capture(events);
      capture.failure = true;
      return capture;
    },
  });
  await rejected.start();
  assert.equal(rejected.active, false);
  assert.match(rejected.state.notice, /Permissão recusada/);
  const delayed = new VoiceRecording({
    changed: () => {},
    completed: (selection) => previews.push(selection),
    factory: (events) => {
      const capture = new Capture(events);
      capture.waiting = new Promise((resolve) => {
        finish = resolve;
      });
      return capture;
    },
  });
  const pending = delayed.start();
  delayed.cancel();
  finish?.();
  await pending;
  assert.equal(delayed.active, false);
  assert.equal(previews.length, 0);
});

await test('voz v2 usa cifra real de anexo, preserva v1 e recusa descritores incompatíveis', async () => {
  const bytes = voiceWav([new Int16Array(voiceRate)]),
    voice = { samples: voiceRate, sampleRate: voiceRate },
    sealed = await sealFile(bytes);
  const raw = {
    version: 2,
    voice,
    name: 'voz.wav',
    type: 'audio/wav',
    image: false,
    caption: '',
    file: sealed.file,
    thumbnail: null,
  };
  const content = attachmentContent(raw);
  assert.deepEqual(await openFile(content.file, sealed.bytes), bytes);
  for (const value of [
    { ...raw, type: 'audio/mpeg' },
    { ...raw, image: true },
    { ...raw, voice: { ...voice, samples: 1 } },
    { ...raw, version: 1 },
  ])
    assert.throws(() => attachmentContent(value));
  const old = { ...raw };
  const legacy = {
    name: old.name,
    type: old.type,
    image: old.image,
    caption: old.caption,
    file: old.file,
    thumbnail: old.thumbnail,
  };
  assert.equal(attachmentContent({ ...legacy, version: 1 }).version, 1);
});
