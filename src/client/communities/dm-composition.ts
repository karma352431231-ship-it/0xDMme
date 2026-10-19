import { t } from '../../shared/i18n/index.ts';
import type { BackupRecord } from '../backup-records/index.ts';

type Message = Extract<BackupRecord, { type: 'dm-message' }> & {
  displayText: string;
};
/** Editing context owns no authority or keys; sending remains with SocialDms. */
export class DmComposition {
  target: Message | null = null;
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
  choose(target: Message): void {
    if (!target.own || target.kind !== 'text' || target.relation)
      throw new Error('Edit by another author.');
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
      this.text.value = '';
      this.text.dispatchEvent(new Event('input'));
    }
    this.clear();
  }
  clear(): void {
    this.target = null;
    if (this.bar) this.bar.hidden = true;
    if (this.label) this.label.textContent = '';
  }
}
