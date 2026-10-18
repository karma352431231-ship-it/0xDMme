import { t } from '../../shared/i18n/index.ts';

/** Explicit synthetic sending action; never reads or plays captured speech. */
export function createTestToneControl(send: () => Promise<void>) {
  const element = document.createElement('section');
  const explanation = document.createElement('p');
  explanation.textContent = t('calls.test-tone-explanation');
  const button = document.createElement('button');
  button.type = 'button';
  button.disabled = true;
  button.textContent = t('calls.test-tone-send');
  const status = document.createElement('p');
  status.setAttribute('role', 'status');
  element.append(explanation, button, status);
  let available = false,
    sending = false,
    blocked = false,
    generation = 0;
  async function run(): Promise<void> {
    if (!available || sending || blocked) return;
    const g = generation;
    sending = true;
    button.disabled = true;
    status.textContent = t('calls.test-tone-sending');
    try {
      await send();
      if (g === generation) status.textContent = t('calls.test-tone-sent');
    } catch {
      if (g === generation) status.textContent = t('calls.test-tone-failed');
    } finally {
      sending = false;
      button.disabled = !available || blocked;
    }
  }
  button.addEventListener('click', () => {
    void run();
  });
  return {
    element,
    busy: () => sending,
    block(next: boolean): void {
      blocked = next;
      button.disabled = !available || sending || blocked;
    },
    update(next: boolean): void {
      if (available === next) return;
      available = next;
      generation++;
      button.disabled = !next || sending || blocked;
      status.textContent = '';
    },
  };
}
