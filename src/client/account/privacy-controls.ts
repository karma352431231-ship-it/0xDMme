import { t } from '../../shared/i18n/index.ts';
import type { ProfilePreferences } from '../account-profile/index.ts';
import {
  settingGroup,
  settingRow,
  settingSaveBar,
  settingSwitch,
} from '../settings-ui/index.ts';

/** The choices this category confirms; other profile choices keep their drafts. */
export const privacyChoices = ['online', 'readReceipts'] as const;
type PrivacyChoice = (typeof privacyChoices)[number];

function template(): string {
  const rows =
    settingRow({
      icon: 'presence',
      label: t('Show online status'),
      tip: t('Only approved contacts see when you are online.'),
      for: 'privacy-online',
      control: settingSwitch({
        id: 'privacy-online',
        attributes: 'name="online"',
      }),
    }) +
    settingRow({
      icon: 'receipts',
      label: t('Read receipts'),
      tip: t(
        'Contacts see when you read their messages. Applies to your whole account.',
      ),
      for: 'privacy-read-receipts',
      control: settingSwitch({
        id: 'privacy-read-receipts',
        attributes: 'name="readReceipts"',
      }),
    });
  return `<form class="set-form" data-privacy-preferences>${settingGroup({ title: t('Presence'), rows })}${settingSaveBar('data-privacy-save')}<p class="set-status" data-privacy-status role="status"></p></form>`;
}

/** The privacy category edits the same committed encrypted profile as account
 * settings. A save bar appears only while a choice differs from the saved one. */
export class PrivacyControls {
  private host: HTMLElement | null = null;
  /** The notice of the last save, until a choice changes again. */
  private outcome = '';
  private readonly ports: {
    value: () => ProfilePreferences | null;
    busy: () => boolean;
    status: () => string;
    changed: () => boolean;
    change: (name: PrivacyChoice, value: boolean) => void;
    discard: () => void;
    confirm: (event: Event) => Promise<void>;
  };
  constructor(ports: PrivacyControls['ports']) {
    this.ports = ports;
  }
  mount(host: HTMLElement): void {
    this.host = host;
    this.outcome = '';
    host.innerHTML = template();
    host.querySelector('form')!.addEventListener('submit', (event) => {
      void this.ports.confirm(event).finally(() => {
        this.outcome = this.ports.status();
        this.render();
      });
    });
    host.querySelector('[data-set-discard]')?.addEventListener('click', () => {
      this.outcome = '';
      this.ports.discard();
    });
    for (const name of privacyChoices) {
      const field = host.querySelector<HTMLInputElement>(
        `input[name="${name}"]`,
      )!;
      field.addEventListener('change', () => {
        this.outcome = '';
        this.ports.change(name, field.checked);
        this.render();
      });
    }
    this.render();
  }
  render(): void {
    if (!this.host) return;
    const value = this.ports.value();
    this.renderChoices(value);
    const bar = this.host.querySelector<HTMLElement>('[data-privacy-save]');
    if (bar) bar.hidden = !value || !this.ports.changed();
    this.host
      .querySelectorAll<HTMLButtonElement>('[data-privacy-save] button')
      .forEach((button) => {
        button.disabled = this.ports.busy();
      });
    const status = this.host.querySelector('[data-privacy-status]');
    if (status)
      status.textContent = value
        ? this.outcome
        : t('Open your account to change privacy settings.');
  }
  private renderChoices(value: ProfilePreferences | null): void {
    if (!this.host) return;
    for (const name of privacyChoices) {
      const field = this.host.querySelector<HTMLInputElement>(
        `input[name="${name}"]`,
      );
      if (!field) continue;
      field.disabled = !value || this.ports.busy();
      field.checked = value?.[name] ?? false;
    }
  }
}
