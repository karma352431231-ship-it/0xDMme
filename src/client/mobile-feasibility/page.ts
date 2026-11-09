import { startLanguage } from '../language/index.ts';
import { t } from '../../shared/i18n/index.ts';
import { Capacitor } from '@capacitor/core';
import {
  clearMobileFeasibility,
  corruptMobileFeasibility,
  expireMobileFeasibility,
  runMobileFeasibility,
} from './index.ts';

function element<T extends HTMLElement>(id: string): T {
  const result = document.getElementById(id);
  if (!result) throw new Error('Incomplete feasibility interface.');
  return result as T;
}

startLanguage();
const run = element<HTMLButtonElement>('run');
const clear = element<HTMLButtonElement>('clear');
const expire = element<HTMLButtonElement>('expire');
const corrupt = element<HTMLButtonElement>('corrupt');
const controls = [run, clear, expire, corrupt];
const status = element<HTMLParagraphElement>('result');
element('platform').textContent = Capacitor.isNativePlatform()
  ? t('Native bridge: {0}.', [Capacitor.getPlatform()])
  : t('Browser preview. This is not native device acceptance.');
let active: AbortController | null = null;

async function perform(
  operation: (signal: AbortSignal) => Promise<string>,
): Promise<void> {
  if (active) return;
  const controller = new AbortController();
  active = controller;
  for (const control of controls) control.disabled = true;
  status.textContent = t('Checking the local test fixture…');
  try {
    const result = await operation(
      AbortSignal.any([controller.signal, AbortSignal.timeout(30_000)]),
    );
    if (!controller.signal.aborted) status.textContent = result;
  } catch {
    status.textContent = controller.signal.aborted
      ? t('Check stopped. No success was recorded.')
      : t(
          'Check failed or expired. No success was recorded. Clear the synthetic fixture to start again.',
        );
  } finally {
    active = null;
    for (const control of controls) control.disabled = false;
  }
}

run.addEventListener('click', () => {
  void perform(async (signal) => {
    const result = await runMobileFeasibility(signal);
    return (
      (result.restored
        ? t('Stored fixture reopened and verified.') + ' '
        : t(
            'Fixture created and verified. Restart the app, then run this check again.',
          ) + ' ') +
      t(
        'Web Locks, nonextractable device keys and Matrix WASM encryption passed. Service identity: {0}',
        [result.applicationOrigin],
      )
    );
  });
});
clear.addEventListener('click', () => {
  void perform(async (signal) => {
    await clearMobileFeasibility(signal);
    return t(
      'Synthetic fixture cleared. Product account data was not accessed.',
    );
  });
});
expire.addEventListener('click', () => {
  void perform(async (signal) => {
    await expireMobileFeasibility(signal);
    return t(
      'Synthetic fixture marked expired. Run checks to verify rejection.',
    );
  });
});
corrupt.addEventListener('click', () => {
  void perform(async (signal) => {
    await corruptMobileFeasibility(signal);
    return t('Synthetic ciphertext altered. Run checks to verify rejection.');
  });
});
// A suspended page must not update its report from a late operation.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) active?.abort();
});
window.addEventListener('pagehide', () => active?.abort());
