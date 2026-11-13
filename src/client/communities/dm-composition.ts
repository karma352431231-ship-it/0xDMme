import { t } from '../../shared/i18n/index.ts';
import type { BackupRecord } from '../backup-records/index.ts';

type Message = Extract<BackupRecord, { type: 'dm-message' }> & {
  displayText: string;
};
/** Owns reply context without borrowing or replacing the new-message draft. */
export class DmComposition {
  replying: Message | null = null;
  private bar: HTMLElement | null = null;
  private label: HTMLElement | null = null;
  private text: HTMLTextAreaElement | null = null;
  bind(
    form: HTMLElement,
    text: HTMLTextAreaElement,
    changed: () => void,
  ): void {
    this.clear();
    this.text = text;
    const bar = document.createElement('div'),
      label = document.createElement('p'),
      cancel = document.createElement('button');
    bar.className = 'compose-context';
    bar.hidden = true;
    cancel.type = 'button';
    cancel.textContent = t('Cancel');
    cancel.addEventListener('click', () => {
      this.cancel();
      changed();
    });
    bar.append(label, cancel);
    form.prepend(bar);
    this.bar = bar;
    this.label = label;
  }
  reply(target: Message): void {
    if (target.relation) throw new Error('Invalid message relationship.');
    this.cancel();
    this.replying = target;
    if (this.bar) this.bar.hidden = false;
    if (this.label)
      this.label.textContent = t('Replying to: {0}', [
        target.displayText.slice(0, 120),
      ]);
    this.text?.focus({ preventScroll: true });
  }
  cancel(): void {
    this.clear();
  }
  /** A sent reply clears its context and the submitted text. */
  finish(): string {
    this.clear();
    return '';
  }
  /** The conversation's unsent text. */
  unsent(): string {
    return this.text?.value ?? '';
  }
  clear(): void {
    this.replying = null;
    if (this.bar) this.bar.hidden = true;
    if (this.label) this.label.textContent = '';
  }
}
