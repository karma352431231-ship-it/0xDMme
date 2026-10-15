import { t, translatedError } from '../../shared/i18n/index.ts';
import {
  enrollmentPayload,
  readEnrollment,
} from '../../shared/device-enrollment/index.ts';

interface EnrollmentAccess {
  enroll: (code: string) => Promise<void>;
  enrollmentState: () => {
    waiting: boolean;
    authorized: boolean;
    message: string;
    failed: boolean;
  };
}
const active = new WeakMap<EnrollmentAccess, HTMLDialogElement>();

/** A camera opens this URL; joining starts only after the person confirms. */
export function startEnrollmentEntry(access: EnrollmentAccess): void {
  const receive = () => {
    if (!location.hash.startsWith('#vincular=')) return;
    const incoming = location.href;
    // Strip even invalid capabilities before mounting, login, or other requests.
    history.replaceState(null, '', '#settings');
    let code: string;
    try {
      code = enrollmentPayload(readEnrollment(incoming, location.origin));
    } catch {
      window.alert(
        t('Este link de vinculação é inválido. Gere outro QR Code.'),
      );
      return;
    }
    showConfirmation(access, code);
  };
  receive();
  window.addEventListener('hashchange', receive);
}
function showConfirmation(access: EnrollmentAccess, code: string): void {
  active.get(access)?.close();
  const dialog = document.createElement('dialog');
  active.set(access, dialog);
  dialog.className = 'device-enrollment-entry';
  dialog.innerHTML = t('html.73a1fbbc7e77');
  document.body.append(dialog);
  const confirm = dialog.querySelector<HTMLButtonElement>(
      '[data-enrollment-confirm]',
    )!,
    close = dialog.querySelector<HTMLButtonElement>('[data-enrollment-close]')!,
    status = dialog.querySelector<HTMLElement>('[data-enrollment-status]')!,
    lifetime = new AbortController();
  let started = false;
  const sync = () => {
    if (!started) return;
    const state = access.enrollmentState();
    status.textContent = state.message;
    const success = state.authorized && !state.waiting;
    confirm.hidden = success;
    if (state.failed) confirm.disabled = false;
    close.textContent = success ? t('Concluído') : t('Fechar');
    if (success)
      dialog.querySelector('h2')!.textContent = t('Conectado com sucesso');
  };
  confirm.addEventListener('click', () => {
    confirm.disabled = true;
    started = true;
    void access
      .enroll(code)
      .then(sync)
      .catch((error: unknown) => {
        status.textContent =
          error instanceof Error
            ? translatedError(error.message)
            : t('Não foi possível conectar este aparelho.');
        confirm.disabled = false;
      });
  });
  close.addEventListener('click', () => dialog.close());
  dialog.addEventListener(
    'close',
    () => {
      lifetime.abort();
      active.delete(access);
      dialog.remove();
    },
    { once: true },
  );
  window.addEventListener('0xdmme-device-status', sync, {
    signal: lifetime.signal,
  });
  window.addEventListener('pagehide', () => dialog.close(), {
    signal: lifetime.signal,
    once: true,
  });
  dialog.showModal();
}

export function mountEnrollmentLogin(
  host: HTMLElement,
  access: EnrollmentAccess,
): void {
  const panel = document.createElement('details');
  panel.className = 'enrollment-login';
  panel.innerHTML = t('html.5acc35953618');
  panel.querySelector('textarea')!.maxLength = 4096;
  panel.querySelector('button')!.addEventListener('click', () => {
    try {
      const code = panel.querySelector('textarea')!.value;
      showConfirmation(
        access,
        enrollmentPayload(readEnrollment(code, location.origin)),
      );
    } catch {
      panel.querySelector('[role="status"]')!.textContent = t(
        'Código inválido. Copie um código ou link válido do aparelho conectado.',
      );
    }
  });
  host.append(panel);
}
