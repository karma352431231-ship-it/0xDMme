import { t } from '../../shared/i18n/index.ts';
import type { DiscoveryMode } from '../../shared/contacts/index.ts';
import {
  settingGroup,
  settingRow,
  settingSaveBar,
} from '../settings-ui/index.ts';
import type { SettingsGlyph } from '../settings-ui/index.ts';

const modes = ['invite', 'wallet'] as const;
function copy(mode: (typeof modes)[number]): {
  icon: SettingsGlyph;
  title: string;
  tip: string;
} {
  if (mode === 'invite')
    return {
      icon: 'link',
      title: t('Only my invitation link'),
      tip: t(
        'Nobody can find you by wallet. Each invitation lets one person accept a chat with you and expires after 24 hours.',
      ),
    };
  return {
    icon: 'wallet',
    title: t('Wallet address or invitation'),
    tip: t(
      'People who know your exact wallet address can send a chat request you must accept. Your wallet is not listed in any directory.',
    ),
  };
}

function template(): string {
  const rows = modes
    .map((mode) => {
      const { icon, title, tip } = copy(mode);
      return settingRow({
        icon,
        label: title,
        tip,
        for: `contact-discovery-${mode}`,
        control: `<input type="radio" class="set-radio" name="contact-discovery" id="contact-discovery-${mode}" value="${mode}">`,
      });
    })
    .join('');
  return (
    settingGroup({
      title: t('Who can request a private chat'),
      tip: t(
        'You always accept a request before chatting. There is no public wallet directory or name search. Your public @ profile and posts have separate visibility.',
      ),
      rows,
    }) + settingSaveBar('data-discovery-save')
  );
}

/** Who may request a private chat. Native radios keep keyboard navigation; the
 * save bar appears only while the selection differs from the saved mode. */
export class DiscoveryChoices {
  /** The mode the server holds; a legacy mode selects neither option. */
  private saved: DiscoveryMode = 'invite';
  private selected: DiscoveryMode = 'invite';
  private host: Element | null = null;

  get value(): DiscoveryMode {
    return this.selected;
  }
  /** The server's mode arrived. An unapplied choice stays on screen; otherwise
   * the shown choice follows the server (a legacy mode selects neither). */
  set value(mode: DiscoveryMode) {
    const pending = this.changed;
    this.saved = mode;
    if (!pending) this.selected = mode;
    this.render();
  }
  /** True while the shown choice still has to be applied. */
  get changed(): boolean {
    return this.selected !== this.saved;
  }
  choose(mode: DiscoveryMode): void {
    this.selected = mode;
    this.render();
  }
  clear(): void {
    this.host = null;
  }
  mount(container: HTMLElement): void {
    this.host = container.querySelector('[data-discovery-choices]');
    if (!this.host) return;
    this.host.innerHTML = template();
    for (const field of this.fields())
      field.addEventListener('change', () => {
        if (field.checked) this.choose(field.value as DiscoveryMode);
      });
    this.host
      .querySelector('[data-set-discard]')
      ?.addEventListener('click', () => {
        this.choose(this.saved);
      });
    this.render();
  }
  private fields(): HTMLInputElement[] {
    return [
      ...(this.host?.querySelectorAll<HTMLInputElement>(
        'input[name="contact-discovery"]',
      ) ?? []),
    ];
  }
  private render(): void {
    for (const field of this.fields())
      field.checked = field.value === this.selected;
    const bar = this.host?.querySelector<HTMLElement>('[data-discovery-save]');
    if (bar) bar.hidden = !this.changed;
  }
}
