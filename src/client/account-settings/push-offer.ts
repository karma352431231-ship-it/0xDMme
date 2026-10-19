import { t, translatedError } from '../../shared/i18n/index.ts';
/**
 * The account wants push, but this browser never granted it. Permission prompts
 * need a tap, so the account choice is offered once per device instead of being
 * requested on load. `enable` runs inside that tap. Resolves false when the
 * offer could not be shown.
 */
export function offerPushOnDevice(input: {
  enable: () => Promise<void>;
  signal: AbortSignal;
}): Promise<boolean> {
  const { enable, signal } = input;
  if (signal.aborted) return Promise.resolve(false);
  return new Promise((resolve) => {
    const dialog = document.createElement('dialog');
    dialog.className = 'settings-pack card';
    dialog.setAttribute('aria-label', t('Notifications on this device'));
    // Static authored markup only.
    dialog.innerHTML = t('html.5ee9df8dde64');
    const status = dialog.querySelector('[data-push-offer-status]')!;
    /** Resolves true once the person saw the offer, whatever they chose. */
    const finish = () => {
      signal.removeEventListener('abort', finish);
      dialog.remove();
      resolve(true);
    };
    dialog
      .querySelector('[data-push-offer-later]')!
      .addEventListener('click', finish);
    const button = dialog.querySelector<HTMLButtonElement>(
      '[data-push-offer-enable]',
    )!;
    button.addEventListener('click', () => {
      button.disabled = true;
      enable().then(finish, (error: unknown) => {
        button.disabled = false;
        status.textContent =
          error instanceof Error
            ? translatedError(error.message)
            : t('Could not enable notifications.');
      });
    });
    dialog.addEventListener('cancel', finish);
    signal.addEventListener('abort', finish, { once: true });
    document.body.append(dialog);
    try {
      dialog.showModal();
    } catch {
      // Another modal is open; the offer comes back on the next visit.
      signal.removeEventListener('abort', finish);
      dialog.remove();
      resolve(false);
    }
  });
}
