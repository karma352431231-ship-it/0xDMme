import { t } from '../../shared/i18n/index.ts';
import type { DiscoveryMode } from '../../shared/contacts/index.ts';

const modes = ['invite', 'wallet'] as const;
function descriptions(mode: (typeof modes)[number]): {
  title: string;
  hint: string;
  explanation: string;
} {
  if (mode === 'invite')
    return {
      title: t('Only through my invitation link'),
      hint: t('Invite people yourself'),
      explanation: t(
        'Only people with an unused invitation can find your private account and request a chat. Each invitation expires after 24 hours and allows one request. New invitations are independent; you still choose whether to accept.',
      ),
    };
  return {
    title: t('By exact wallet address or invitation'),
    hint: t(
      'People who know your wallet address can send you a chat invitation',
    ),
    explanation: t(
      'Anyone with your complete wallet address or active invitation link can find your private account and request a chat. You must accept before they can message you. This does not publish your wallet in a directory.',
    ),
  };
}

/** Native radios retain keyboard navigation. Mouse explanations require a
 * continuous one-second hover; keyboard focus uses the same delay. */
export class DiscoveryChoices {
  private selected: DiscoveryMode = 'invite';
  private fields = new Map<DiscoveryMode, HTMLInputElement>();
  private closeTip: (() => void) | null = null;

  get value(): DiscoveryMode {
    return this.selected;
  }
  set value(mode: DiscoveryMode) {
    // An existing restrictive legacy setting is preserved until the owner
    // explicitly chooses one of the two visible options and saves it.
    this.selected = mode;
    for (const [value, field] of this.fields) field.checked = value === mode;
  }
  clear(): void {
    this.closeTip?.();
    this.closeTip = null;
  }
  mount(container: HTMLElement): void {
    this.clear();
    this.fields.clear();
    const host = container.querySelector('[data-discovery-choices]');
    if (!host) return;
    const group = document.createElement('fieldset'),
      legend = document.createElement('legend');
    group.className = 'discovery-choices';
    legend.textContent = t('Who can request a private chat');
    group.append(legend);
    for (const mode of modes) group.append(this.choice(mode));
    host.replaceChildren(group);
    this.value = this.selected;
  }
  private choice(mode: (typeof modes)[number]): HTMLElement {
    const copy = descriptions(mode),
      row = document.createElement('div'),
      label = document.createElement('label'),
      field = document.createElement('input'),
      text = document.createElement('span'),
      title = document.createElement('strong'),
      hint = document.createElement('small'),
      tip = document.createElement('div');
    row.className = 'discovery-choice';
    field.type = 'radio';
    field.name = 'contact-discovery';
    field.value = mode;
    field.setAttribute('aria-describedby', `discovery-tip-${mode}`);
    field.addEventListener('change', () => {
      if (field.checked) this.value = mode;
    });
    this.fields.set(mode, field);
    title.textContent = copy.title;
    hint.textContent = copy.hint;
    text.append(title, hint);
    label.append(field, text);
    tip.id = `discovery-tip-${mode}`;
    tip.className = 'discovery-tip';
    tip.setAttribute('role', 'tooltip');
    tip.textContent = copy.explanation;
    this.bindTip(row, tip);
    row.append(label, tip);
    return row;
  }
  private bindTip(row: HTMLElement, tip: HTMLElement): void {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const close = (): void => {
      if (timer !== null) clearTimeout(timer);
      timer = null;
      tip.hidden = true;
    };
    const schedule = (): void => {
      this.clear();
      this.closeTip = close;
      timer = setTimeout(() => {
        timer = null;
        tip.hidden = false;
      }, 1000);
    };
    close();
    row.addEventListener('pointerenter', (event) => {
      if (event.pointerType === 'mouse') schedule();
    });
    row.addEventListener('pointerleave', close);
    row.addEventListener('focusin', () => {
      if (row.querySelector(':focus-visible')) schedule();
    });
    row.addEventListener('focusout', close);
    row.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') close();
    });
  }
}
