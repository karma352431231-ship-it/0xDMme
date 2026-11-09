import { openPublicDm } from './native-product-social.ts';
import {
  node,
  until,
  textButton,
  waitButton,
  labelledField,
} from './native-product-dom.ts';
import type { NativeAction, NativeActionInput } from './native-product-dom.ts';

/** Uses the actual approved public DM recorder, never synthetic audio samples. */
async function capture({ value, signal }: NativeActionInput): Promise<string> {
  await openPublicDm(value, signal);
  await waitButton('[data-communities]', 'Gravar áudio', signal);
  const record = [
    ...node('[data-communities]').querySelectorAll('button'),
  ].find((button) => button.textContent === 'Gravar áudio');
  if (!record) throw new Error('The public DM recorder is unavailable.');
  labelledField(
    '[data-communities]',
    'Mensagem de texto',
    'Synthetic native microphone recording',
  );
  record.scrollIntoView({ block: 'center' });
  record.dataset['nativeTestTap'] = 'voice-record';
  try {
    await until(
      () => {
        const status =
          node('[data-communities] .community-feedback').textContent ?? '';
        if (status.startsWith('Gravação não iniciada:'))
          throw new Error('The actual public DM recorder failed: ' + status);
        return status.startsWith('Gravando.');
      },
      signal,
      'The real public DM recorder after native OS permission',
    );
    await new Promise<void>((resolve) => setTimeout(resolve, 1800));
    textButton('[data-communities]', 'Concluir gravação');
    await until(
      () =>
        node('[data-communities] .community-feedback').textContent?.startsWith(
          'Áudio preparado.',
        ) === true,
      signal,
      'The actual nonempty recorded WAV staged by the public DM',
    );
    await waitButton('[data-communities]', 'Enviar mídia preparada', signal);
    textButton('[data-communities]', 'Enviar mídia preparada');
    await until(
      () =>
        [...document.querySelectorAll('.social-dm-history article')].some(
          (row) =>
            row.querySelector('strong')?.textContent === 'Você' &&
            !!row.querySelector('.voice-message'),
        ),
      signal,
      'The accepted encrypted recorded voice message',
    );
    const voice = [
      ...document.querySelectorAll<HTMLElement>('.social-dm-history article'),
    ]
      .find(
        (row) =>
          row.querySelector('strong')?.textContent === 'Você' &&
          !!row.querySelector('.voice-message'),
      )
      ?.querySelector<HTMLElement>('.voice-message');
    const id = voice?.dataset['voiceId'];
    const duration = Number(voice?.dataset['duration']);
    if (!id || !Number.isFinite(duration) || duration <= 0)
      throw new Error(
        'The accepted voice lacks a valid identity or nonzero recording duration.',
      );
    return JSON.stringify({ id, duration });
  } finally {
    delete record.dataset['nativeTestTap'];
  }
}

export const socialVoiceActions: ReadonlyMap<string, NativeAction> = new Map([
  ['social-voice-send', capture],
  ['social-voice-receive', receive],
]);

function expectedVoice(value: string): {
  handle: string;
  id: string;
  duration: number;
} {
  const input = JSON.parse(value) as unknown;
  if (
    typeof input !== 'object' ||
    input === null ||
    !('handle' in input) ||
    !('id' in input) ||
    !('duration' in input) ||
    typeof input.handle !== 'string' ||
    typeof input.id !== 'string' ||
    typeof input.duration !== 'number'
  )
    throw new Error(
      'Expected the accepted synthetic voice identity and duration.',
    );
  return { handle: input.handle, id: input.id, duration: input.duration };
}

async function receive({ value, signal }: NativeActionInput): Promise<string> {
  const expected = expectedVoice(value);
  await openPublicDm(expected.handle, signal);
  const selector = `.social-dm-history .voice-message[data-voice-id="${CSS.escape(expected.id)}"]`;
  await until(
    () => !!document.querySelector(selector),
    signal,
    'The independently opened recorded voice identity',
  );
  const voice = node<HTMLElement>(selector);
  if (Number(voice.dataset['duration']) !== expected.duration)
    throw new Error('The independently received recording duration differed.');
  const toggle = node<HTMLButtonElement>(selector + ' .voice-toggle');
  await until(() => !toggle.disabled, signal);
  toggle.scrollIntoView({ block: 'center' });
  toggle.dataset['nativeTestTap'] = 'voice-record';
  try {
    await until(
      () =>
        document.querySelector(selector)?.getAttribute('data-state') ===
          'playing' &&
        Number(
          document.querySelector<HTMLInputElement>(
            selector + ' .voice-progress',
          )?.value,
        ) > 0,
      signal,
      'The actual recipient decryption and playing recorded WAV',
    );
    return expected.id;
  } finally {
    delete toggle.dataset['nativeTestTap'];
    const current = document.querySelector<HTMLButtonElement>(
      selector + ' .voice-toggle',
    );
    if (current?.getAttribute('aria-label') === 'Pausar mensagem de voz')
      current.click();
  }
}
