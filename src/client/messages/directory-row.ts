import { t, currentLanguage } from '../../shared/i18n/index.ts';
import { displayName, paintAvatar } from '../appearance/index.ts';
import { paintConversationPreview } from '../conversation-preview/index.ts';
import { menuIcon } from '../menu-icons/index.ts';
import {
  paintConversationAvatar,
  releaseConversationAvatar,
} from './directory-avatars.ts';
import type { ConversationEntry, DirectoryMenu } from './directory-types.ts';

function attribute(node: HTMLElement, name: string, value: string): void {
  if (node.getAttribute(name) !== value) node.setAttribute(name, value);
}
function text(node: HTMLElement, value: string): void {
  if (node.textContent !== value) node.textContent = value;
}

/** One live row: new projections replace its data, never its click closure or photo host. */
export class ConversationRow {
  readonly button = document.createElement('button');
  private readonly avatar = document.createElement('span');
  private readonly copy = document.createElement('span');
  private readonly title = document.createElement('strong');
  private readonly detail = document.createElement('small');
  private unread: HTMLElement | null = null;
  private wrapper: HTMLElement | null = null;
  private trigger: HTMLButtonElement | null = null;
  private entry: ConversationEntry;
  private appearance = '';
  private preview = '';
  private statusLabel = '';
  constructor(entry: ConversationEntry) {
    this.entry = entry;
    this.button.type = 'button';
    this.button.className = 'conversation-row';
    this.button.dataset['conversation'] = entry.id;
    this.avatar.setAttribute('aria-hidden', 'true');
    this.copy.className = 'conversation-copy';
    this.copy.append(this.title, this.detail);
    this.button.append(this.avatar, this.copy);
    this.button.addEventListener('click', () => this.entry.open());
  }
  get element(): HTMLElement {
    return this.wrapper ?? this.button;
  }
  update(entry: ConversationEntry, menu?: DirectoryMenu): void {
    this.entry = entry;
    attribute(this.button, 'aria-pressed', String(entry.selected));
    text(this.title, displayName(entry.title));
    const title = this.title.textContent !== entry.title ? entry.title : '';
    if (this.title.title !== title) this.title.title = title;
    this.updateCopy(entry);
    this.updateUnread(entry.unread ?? 0);
    this.updateAvatar(entry);
    this.updateMenu(menu);
  }
  private updateCopy(entry: ConversationEntry): void {
    const projection = JSON.stringify([
      entry.detail,
      entry.preview,
      currentLanguage(),
    ]);
    if (projection === this.preview) return;
    this.preview = projection;
    this.detail.textContent = entry.detail;
    this.copy.querySelector('.conversation-time')?.remove();
    if (entry.preview) paintConversationPreview(this.copy, entry.preview);
  }
  private updateUnread(count: number): void {
    if (!count) {
      this.unread?.remove();
      this.unread = null;
      return;
    }
    if (!this.unread) {
      this.unread = document.createElement('span');
      this.unread.className = 'conversation-unread';
      this.button.append(this.unread);
    }
    text(this.unread, count > 99 ? '99+' : String(count));
    attribute(this.unread, 'aria-label', t('{0} unread messages', [count]));
  }
  private updateAvatar(entry: ConversationEntry): void {
    const appearance = JSON.stringify([
      entry.title,
      entry.seed ?? entry.id,
      entry.kind,
      !!entry.avatar,
    ]);
    if (appearance !== this.appearance) {
      releaseConversationAvatar(this.button);
      paintAvatar(this.avatar, {
        label: entry.title,
        seed: entry.seed ?? entry.id,
      });
      this.appearance = appearance;
    }
    const classes = `conversation-avatar ${entry.kind}${entry.status ? ' has-status' : ''}`;
    if (this.avatar.className !== classes) this.avatar.className = classes;
    const statusLabel = entry.status ? t('Active status') : '';
    if (statusLabel) attribute(this.avatar, 'title', statusLabel);
    else if (this.statusLabel === this.avatar.getAttribute('title'))
      this.avatar.removeAttribute('title');
    this.statusLabel = statusLabel;
    paintConversationAvatar(
      this.button,
      this.avatar,
      entry.avatar,
      entry.avatarVersion,
    );
  }
  private updateMenu(menu?: DirectoryMenu): void {
    if (!menu || !this.entry.actions?.length) {
      this.button.removeAttribute('aria-haspopup');
      if (this.wrapper) this.wrapper.replaceWith(this.button);
      this.wrapper = this.trigger = null;
      return;
    }
    if (!this.wrapper || !this.trigger) this.createMenu();
    attribute(this.button, 'aria-haspopup', 'dialog');
    attribute(
      this.trigger!,
      'aria-label',
      t('Options for {0}', [this.entry.title]),
    );
    menu.bind(this.wrapper!, this.entry, this.trigger!);
  }
  private createMenu(): void {
    const wrapper = document.createElement('div');
    wrapper.className = 'conversation-item';
    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'conversation-menu-trigger';
    trigger.append(menuIcon('chevron'));
    trigger.setAttribute('aria-haspopup', 'dialog');
    if (this.button.parentElement) this.button.replaceWith(wrapper);
    wrapper.append(this.button, trigger);
    this.wrapper = wrapper;
    this.trigger = trigger;
  }
  dispose(): void {
    releaseConversationAvatar(this.button);
    this.element.remove();
  }
}
