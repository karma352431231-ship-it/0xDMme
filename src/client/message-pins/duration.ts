import { t } from '../../shared/i18n/index.ts';
import { pinForever } from '../../shared/daily/index.ts';

const day = 86_400_000;
/** The pin lengths offered before pinning (owner, 12/11/2026). */
const choices = [
  ['pin.duration-1d', day],
  ['pin.duration-7d', 7 * day],
  ['pin.duration-30d', 30 * day],
  ['pin.duration-forever', pinForever],
] as const;

/**
 * Asks how long a message stays pinned. Resolves the moment the pin ends,
 * Number.MAX_SAFE_INTEGER for no limit, or null when the person cancels.
 */
export function choosePinDuration(
  now: () => number = Date.now,
): Promise<number | null> {
  const dialog = document.createElement('dialog'),
    form = document.createElement('form'),
    title = document.createElement('h2'),
    hint = document.createElement('p'),
    list = document.createElement('div'),
    buttons = document.createElement('div'),
    cancel = document.createElement('button'),
    confirm = document.createElement('button');
  dialog.className = 'pin-duration';
  dialog.setAttribute('aria-labelledby', 'pin-duration-title');
  title.id = 'pin-duration-title';
  title.textContent = t('Choose how long the pin lasts');
  hint.textContent = t('Everyone in this chat sees pinned messages.');
  list.className = 'pin-duration-choices';
  choices.forEach(([label, length], index) => {
    const option = document.createElement('label'),
      input = document.createElement('input');
    input.type = 'radio';
    input.name = 'pin-duration';
    input.value = String(length);
    input.checked = index === 1;
    option.append(input, document.createTextNode(t(label)));
    list.append(option);
  });
  buttons.className = 'pin-duration-buttons';
  cancel.type = 'button';
  cancel.textContent = t('Cancel');
  confirm.type = 'submit';
  confirm.className = 'primary';
  confirm.textContent = t('Pin');
  buttons.append(cancel, confirm);
  form.method = 'dialog';
  form.append(title, hint, list, buttons);
  dialog.append(form);
  document.body.append(dialog);
  return new Promise((resolve) => {
    let chosen: number | null = null;
    cancel.addEventListener('click', () => dialog.close());
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const value = Number(
        form.querySelector<HTMLInputElement>('input:checked')?.value,
      );
      if (value === pinForever) chosen = pinForever;
      else if (Number.isSafeInteger(value) && value > 0) chosen = now() + value;
      dialog.close();
    });
    dialog.addEventListener('close', () => {
      dialog.remove();
      resolve(chosen);
    });
    dialog.showModal();
  });
}
