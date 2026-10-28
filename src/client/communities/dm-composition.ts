import { t } from '../../shared/i18n/index.ts';
import type { BackupRecord } from '../backup-records/index.ts';

type Message = Extract<BackupRecord, { type: 'dm-message' }> & {
  displayText: string;
};
/**
 * Editing context owns no authority or keys; sending remains with SocialDms.
 * Editing borrows the composer: the unsent text in it is set aside and comes
 * back when the edit is canceled or sent.
 */
export class DmComposition {
  target: Message | null = null;
  private bar: HTMLElement | null = null;
  private label: HTMLElement | null = null;
  private text: HTMLTextAreaElement | null = null;
  private setAside = '';
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
  choose(target: Message): void {
    if (!target.own || target.kind !== 'text' || target.relation)
      throw new Error('Edit by another author.');
    // Switching to another edit keeps the text set aside by the first one.
    if (!this.target) this.setAside = this.text?.value ?? '';
    this.target = target;
    if (this.bar) this.bar.hidden = false;
    if (this.label)
      this.label.textContent = t('{0}: {1}', [
        t('Editing'),
        target.displayText.slice(0, 120),
      ]);
    if (this.text) {
      this.text.value = target.displayText;
      this.text.dispatchEvent(new Event('input'));
      this.text.focus();
    }
  }
  cancel(): void {
    if (this.target && this.text) {
      this.text.value = this.setAside;
      this.text.dispatchEvent(new Event('input'));
    }
    this.clear();
  }
  /** After a send: the text set aside by an edit, or nothing. */
  finish(): string {
    const text = this.setAside;
    this.clear();
    return text;
  }
  /** The conversation's unsent text, even while an edit borrows the composer. */
  unsent(): string {
    return this.target ? this.setAside : (this.text?.value ?? '');
  }
  clear(): void {
    this.target = null;
    this.setAside = '';
    if (this.bar) this.bar.hidden = true;
    if (this.label) this.label.textContent = '';
  }
}
