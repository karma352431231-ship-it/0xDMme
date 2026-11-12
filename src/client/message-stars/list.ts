import {
  t,
  translatedError,
  currentLanguage,
} from '../../shared/i18n/index.ts';
import { menuIcon } from '../menu-icons/index.ts';
import type { StarredMessage } from './store.ts';

/**
 * The starred messages of one conversation. Owns only its dialog; reading the
 * list and opening a message stay with the conversation that shows it.
 */
export class StarredList {
  private readonly dialog = document.createElement('dialog');
  private readonly list = document.createElement('ul');
  private readonly notice = document.createElement('p');
  private generation = 0;
  constructor() {
    const header = document.createElement('header'),
      title = document.createElement('h2'),
      close = document.createElement('button');
    this.dialog.className = 'starred-list';
    this.dialog.setAttribute('aria-labelledby', 'starred-list-title');
    title.id = 'starred-list-title';
    title.textContent = t('Starred messages');
    close.type = 'button';
    close.className = 'info-icon';
    close.setAttribute('aria-label', t('Close'));
    close.append(menuIcon('close'));
    close.addEventListener('click', () => this.close());
    header.append(title, close);
    this.notice.setAttribute('role', 'status');
    this.dialog.append(header, this.notice, this.list);
    this.dialog.addEventListener('close', () => this.generation++);
    document.body.append(this.dialog);
  }
  close(): void {
    if (this.dialog.open) this.dialog.close();
  }
  async show(input: {
    read: () => Promise<StarredMessage[]>;
    open: (message: StarredMessage) => void;
  }): Promise<void> {
    const generation = ++this.generation;
    this.list.replaceChildren();
    this.notice.textContent = t('Loading…');
    if (!this.dialog.open) this.dialog.showModal();
    try {
      const messages = await input.read();
      if (generation !== this.generation) return;
      this.notice.textContent = messages.length
        ? ''
        : t('No starred messages in this chat yet.');
      this.list.replaceChildren(
        ...messages.map((message) => this.row(message, input.open)),
      );
    } catch (error: unknown) {
      if (generation === this.generation)
        this.notice.textContent =
          error instanceof Error
            ? translatedError(error.message)
            : t('Could not complete the operation.');
    }
  }
  private row(
    message: StarredMessage,
    open: (message: StarredMessage) => void,
  ): HTMLElement {
    const item = document.createElement('li'),
      button = document.createElement('button'),
      text = document.createElement('span'),
      time = document.createElement('time');
    button.type = 'button';
    text.textContent = message.excerpt || t('Message');
    if (message.sentAt !== undefined) {
      const date = new Date(message.sentAt);
      time.dateTime = date.toISOString();
      time.textContent = date.toLocaleString(currentLanguage(), {
        dateStyle: 'medium',
        timeStyle: 'short',
      });
    }
    button.append(menuIcon('star'), text, time);
    button.addEventListener('click', () => {
      this.close();
      open(message);
    });
    item.append(button);
    return item;
  }
}
