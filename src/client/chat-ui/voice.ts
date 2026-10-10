import { voiceDuration, voiceRate } from '../../shared/voice/index.ts';
import { showToast } from '../toast/index.ts';
import type { RecordingState } from '../voice-recording/index.ts';

const holdDelay = 250,
  doubleTap = 350;

/**
 * Touch: hold the mic to record and release to review, or tap twice to record
 * hands-free. Mouse and keyboard keep the plain click, which records
 * hands-free. Nothing is ever sent by a gesture; the preview waits for Enviar.
 */
export function bindRecordGesture(
  button: HTMLButtonElement | null,
  actions: { start: () => void; release: () => void },
): void {
  if (!button) return;
  const form = button.closest<HTMLElement>('form');
  let hold = 0,
    hint = 0,
    held = false,
    lastTap = 0,
    touch = false;
  const finish = (event: PointerEvent): void => {
    window.removeEventListener('pointerup', finish);
    window.removeEventListener('pointercancel', finish);
    clearTimeout(hold);
    if (held) {
      held = false;
      if (form) delete form.dataset['voiceHold'];
      actions.release();
      return;
    }
    if (event.type === 'pointercancel') return;
    if (event.timeStamp - lastTap < doubleTap) {
      lastTap = 0;
      clearTimeout(hint);
      actions.start();
      return;
    }
    lastTap = event.timeStamp;
    hint = window.setTimeout(() => {
      showToast('Segure para gravar ou toque duas vezes.');
    }, doubleTap);
  };
  button.addEventListener('pointerdown', (event) => {
    touch = event.pointerType !== 'mouse';
    if (!touch || button.disabled) return;
    // The mic disappears behind the recording bar; the window still hears the release.
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);
    hold = window.setTimeout(() => {
      held = true;
      clearTimeout(hint);
      if (form) form.dataset['voiceHold'] = 'true';
      actions.start();
    }, holdDelay);
  });
  button.addEventListener('contextmenu', (event) => {
    event.preventDefault();
  });
  button.addEventListener('click', (event) => {
    if (touch) {
      touch = false;
      event.preventDefault();
      return;
    }
    actions.start();
  });
}

/** Recording bar clock and the composer notice for the current phase. */
export function showRecording(
  form: HTMLElement | null,
  state: RecordingState,
): void {
  const notice = form?.querySelector('[data-voice-status]'),
    clock = form?.querySelector('[data-voice-clock]');
  // While recording the bar speaks for itself; other phases keep their notice.
  if (notice)
    notice.textContent = state.phase === 'recording' ? '' : state.notice;
  if (clock)
    clock.textContent = voiceDuration({
      samples: state.samples,
      sampleRate: voiceRate,
    });
}
