import { t } from '../../shared/i18n/index.ts';
import { settingRow, settingSwitch } from '../settings-ui/index.ts';

/**
 * The weekly backup reminder, a choice of the encrypted private profile. It
 * sits under Notifications and calls (owner, 18/11/2026) and, like the other
 * switches there, applies when changed. A failed save shows the saved value.
 */
export class BackupReminderControl {
  private host: HTMLElement | null = null;
  private readonly ports: {
    /** The saved or drafted choice; null while the profile is not open. */
    value: () => boolean | null;
    busy: () => boolean;
    save: (on: boolean) => Promise<void>;
  };
  constructor(ports: BackupReminderControl['ports']) {
    this.ports = ports;
  }
  mount(host: HTMLElement): void {
    this.host = host;
    host.innerHTML = settingRow({
      icon: 'storage',
      label: t('Remind me to save a backup every seven days'),
      for: 'backup-reminder',
      control: settingSwitch({
        id: 'backup-reminder',
        attributes: 'data-backup-reminder',
      }),
    });
    const field = this.field();
    field?.addEventListener('change', () => {
      void this.ports.save(field.checked).finally(() => this.render());
    });
    this.render();
  }
  render(): void {
    const field = this.field();
    if (!field) return;
    const value = this.ports.value();
    field.checked = value ?? false;
    field.disabled = value === null || this.ports.busy();
  }
  private field(): HTMLInputElement | null {
    return (
      this.host?.querySelector<HTMLInputElement>('[data-backup-reminder]') ??
      null
    );
  }
}
