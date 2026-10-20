import { t } from '../../shared/i18n/index.ts';
import type { DiscoveryMode } from '../../shared/contacts/index.ts';

const modes = ['invite', 'wallet', 'contacts'] as const;
function descriptions(mode: DiscoveryMode): {
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
  if (mode === 'wallet')
    return {
      title: t('By exact wallet address or invitation'),
      hint: t('Let people find your exact wallet'),
      explanation: t(
        'Anyone with your complete wallet address or active invitation link can find your private account and request a chat. You must accept before they can message you. This does not publish your wallet in a directory.',
      ),
    };
  return {
    title: t('Approved contacts only'),
    hint: t('Stop new chat requests'),
    explanation: t(
      'Only contacts you have already approved can chat with you. New requests are disabled, including requests through your invitation link or exact wallet address. Existing contacts stay approved.',
    ),
  };
}

/** Native radios retain keyboard navigation; explanations also open by touch. */
export class DiscoveryChoices {
  private selected: DiscoveryMode = 'invite';
  private fields = new Map<DiscoveryMode, HTMLInputElement>();
  private closeTip: (() => void) | null = null;

  get value(): DiscoveryMode {
    return this.selected;
  }
  set value(mode: DiscoveryMode) {
    this.selected = mode;
    for (const [value, field] of this.fields) field.checked = value === mode;
  }
  mount(container: HTMLElement): void {
    this.closeTip?.();
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
  private choice(mode: DiscoveryMode): HTMLElement {
    const copy = descriptions(mode),
      row = document.createElement('div'),
      label = document.createElement('label'),
      field = document.createElement('input'),
      text = document.createElement('span'),
      title = document.createElement('strong'),
      hint = document.createElement('small'),
      help = document.createElement('button'),
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
    help.type = 'button';
    help.className = 'discovery-help';
    help.textContent = 'i';
    help.setAttribute('aria-label', t('Explain: {0}', [copy.title]));
    help.setAttribute('aria-controls', `discovery-tip-${mode}`);
    tip.id = `discovery-tip-${mode}`;
    tip.className = 'discovery-tip';
    tip.setAttribute('role', 'tooltip');
    tip.textContent = copy.explanation;
    this.bindTip({ row, help, tip });
    row.append(label, help, tip);
    return row;
  }
  private bindTip(input: {
    row: HTMLElement;
    help: HTMLButtonElement;
    tip: HTMLElement;
  }): void {
    const { row, help, tip } = input;
    let pinned = false,
      hovered = false;
    const close = (): void => {
      pinned = false;
      tip.hidden = true;
      help.setAttribute('aria-expanded', 'false');
    };
    const open = (): void => {
      this.closeTip?.();
      this.closeTip = close;
      tip.hidden = false;
      help.setAttribute('aria-expanded', 'true');
    };
    close();
    row.addEventListener('pointerenter', (event) => {
      if (event.pointerType !== 'mouse') return;
      hovered = true;
      open();
    });
    row.addEventListener('pointerleave', () => {
      hovered = false;
      if (!pinned && !row.contains(document.activeElement)) close();
    });
    row.addEventListener('focusin', open);
    row.addEventListener('focusout', (event) => {
      if (event.relatedTarget && row.contains(event.relatedTarget as Node))
        return;
      if (!hovered) close();
    });
    help.addEventListener('click', () => {
      if (pinned) close();
      else {
        open();
        pinned = true;
      }
    });
    row.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') close();
    });
  }
}
