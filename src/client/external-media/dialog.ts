import { t } from '../../shared/i18n/index.ts';
import type { MediaScope } from './preferences.ts';
export const externalMediaNotice = t(
  'GIFs and external videos connect you to providers, who receive your IP and may collect searches, browser data, cookies and playback data. Conversations remain encrypted; the app does not send them your wallet, keys or conversation history.',
);
export const klipyNotice = t(
  'When searching for or loading GIFs, your device connects to KLIPY, which receives your IP and may collect your searches, accessed GIFs and browser data. The app does not send your wallet, keys or conversation history to KLIPY.',
);

/** No provider resources are present in this dialog. Closing is not consent. */
export function mediaConsentDialog(
  scope: MediaScope,
  signal: AbortSignal,
): Promise<boolean | null> {
  if (signal.aborted) return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const dialog = document.createElement('dialog');
    dialog.className = 'external-media-consent card';
    dialog.setAttribute('aria-label', t('External media privacy'));
    const title = document.createElement('h2'),
      notice = document.createElement('p'),
      detail = document.createElement('small'),
      actions = document.createElement('div');
    title.textContent =
      scope === 'all' ? t('External media') : t('GIFs from KLIPY');
    notice.textContent = scope === 'all' ? externalMediaNotice : klipyNotice;
    detail.textContent = t(
      'When signed in, this choice follows your account and can be changed in Profile.',
    );
    actions.className = 'settings-actions';
    const finish = (choice: boolean | null) => {
      signal.removeEventListener('abort', cancel);
      dialog.remove();
      resolve(choice);
    };
    const cancel = () => finish(null);
    for (const [choice, label] of [
      [true, scope === 'all' ? t('Allow external media') : t('Allow GIFs')],
      [false, t('Keep links only')],
    ] as const) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = label;
      button.addEventListener('click', () => finish(choice), { once: true });
      actions.append(button);
    }
    dialog.append(title, notice, detail, actions);
    dialog.addEventListener('cancel', cancel, { once: true });
    signal.addEventListener('abort', cancel, { once: true });
    document.body.append(dialog);
    try {
      dialog.showModal();
    } catch (error: unknown) {
      signal.removeEventListener('abort', cancel);
      dialog.remove();
      reject(
        error instanceof Error
          ? error
          : new Error('Privacy notice unavailable.'),
      );
    }
  });
}
