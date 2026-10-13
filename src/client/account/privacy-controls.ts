import { t } from '../../shared/i18n/index.ts';
import type { ProfilePreferences } from '../account-profile/index.ts';

const choices = ['online', 'readReceipts'] as const;
const template = t('html.7eb60c98aba6');

/** The privacy category edits the same committed encrypted profile as account settings. */
export class PrivacyControls {
  private host: HTMLElement | null = null;
  private readonly ports: {
    value: () => ProfilePreferences | null;
    busy: () => boolean;
    status: () => string;
    change: (name: 'online' | 'readReceipts', value: boolean) => void;
    confirm: (event: Event) => Promise<void>;
  };
  constructor(ports: PrivacyControls['ports']) {
    this.ports = ports;
  }
  mount(host: HTMLElement): void {
    this.host = host;
    host.innerHTML = template;
    host.querySelector('form')!.addEventListener('submit', (event) => {
      void this.ports.confirm(event);
    });
    for (const name of choices) {
      const field = host.querySelector<HTMLInputElement>(
        `input[name="${name}"]`,
      )!;
      field.addEventListener('change', () =>
        this.ports.change(name, field.checked),
      );
    }
    this.render();
  }
  render(): void {
    const value = this.ports.value();
    this.renderChoices(value);
    const confirm = this.host?.querySelector<HTMLButtonElement>('button');
    if (confirm) confirm.disabled = !value || this.ports.busy();
    const status = this.host?.querySelector('[data-privacy-status]');
    if (status)
      status.textContent = value
        ? this.ports.status()
        : t('Abra sua conta para alterar a privacidade.');
  }
  private renderChoices(value: ProfilePreferences | null): void {
    if (!this.host) return;
    for (const name of choices) {
      const field = this.host.querySelector<HTMLInputElement>(
        `input[name="${name}"]`,
      );
      if (!field) continue;
      field.disabled = !value || this.ports.busy();
      field.checked = value?.[name] ?? false;
    }
  }
}
