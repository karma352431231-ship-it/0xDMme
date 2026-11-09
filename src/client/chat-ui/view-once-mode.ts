import { t } from '../../shared/i18n/index.ts';

const mounted = new WeakSet<HTMLElement>();
const preference = '0xdmme:view-once-intro:v1';
let explained = false;

export function viewOnceEnabled(form: HTMLElement | null): boolean {
  return form?.dataset['viewOnce'] === 'true';
}

function firstExplanation(): boolean {
  if (explained) return false;
  explained = true;
  try {
    if (localStorage.getItem(preference) === '1') return false;
    localStorage.setItem(preference, '1');
  } catch {
    // A restricted store still gets one explanation during this app session.
  }
  return true;
}

/** Mode changes are local. The one-time explanation survives app restarts. */
export function bindViewOnceMode(form: HTMLElement, changed: () => void): void {
  if (mounted.has(form)) return;
  const button = form.querySelector<HTMLButtonElement>('[data-view-once]');
  if (!button || button.hidden) return;
  mounted.add(form);
  button.addEventListener('click', () => {
    const enabled = !viewOnceEnabled(form);
    form.dataset['viewOnce'] = String(enabled);
    button.setAttribute('aria-pressed', String(enabled));
    button.setAttribute(
      'aria-label',
      t(enabled ? 'Disable view once' : 'View once'),
    );
    if (firstExplanation()) {
      const hint = document.createElement('div');
      hint.className = 'compose-view-once-hint';
      hint.setAttribute('role', 'status');
      hint.textContent = t(
        'Text and images open once in the app. Files download once.',
      );
      form.append(hint);
      setTimeout(() => {
        hint.dataset['closing'] = 'true';
        setTimeout(() => hint.remove(), 240);
      }, 4400);
    }
    changed();
  });
}
