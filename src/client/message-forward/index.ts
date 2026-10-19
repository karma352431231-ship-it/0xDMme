import { observeForwardPhoto } from './photo.ts';
import { t, translatedError } from '../../shared/i18n/index.ts';
import { paintAvatar } from '../appearance/index.ts';
import type { ProfileCard } from '../message-profile/index.ts';
export interface ForwardContact {
  id: string;
  title: string;
  seed: string;
}
export interface ForwardDirectory {
  contacts: () => readonly ForwardContact[];
  profile: (id: string) => Promise<ProfileCard | null>;
  more: () => boolean;
  loadMore: () => Promise<void>;
}
export function chooseForwardContact(
  directory: ForwardDirectory,
  signal: AbortSignal,
): Promise<string | null> {
  if (signal.aborted) return Promise.resolve(null);
  return new Promise((resolve) => {
    const picker = new ForwardContactPicker(directory, resolve);
    picker.open(signal);
  });
}
class ForwardContactPicker {
  private readonly directory: ForwardDirectory;
  private readonly done: (id: string | null) => void;
  private readonly lifetime = new AbortController();
  private readonly dialog = document.createElement('dialog');
  private readonly list = document.createElement('div');
  private readonly query = document.createElement('input');
  private readonly status = document.createElement('p');
  private readonly more = document.createElement('button');
  private photos = new AbortController();
  private finished = false;
  constructor(directory: ForwardDirectory, done: (id: string | null) => void) {
    this.directory = directory;
    this.done = done;
  }
  open(signal: AbortSignal): void {
    this.dialog.className = 'forward-contacts';
    this.dialog.setAttribute('aria-label', t('forward.choose-contact'));
    const title = document.createElement('h2'),
      cancel = document.createElement('button');
    title.textContent = t('forward.choose-contact');
    this.query.type = 'search';
    this.query.placeholder = t('forward.search');
    this.query.setAttribute('aria-label', t('forward.search'));
    this.query.addEventListener('input', () => this.render());
    this.more.type = 'button';
    this.more.textContent = t('forward.more');
    this.more.addEventListener('click', () => {
      void this.loadMore();
    });
    cancel.type = 'button';
    cancel.textContent = t('Cancel');
    cancel.addEventListener('click', () => this.finish(null));
    this.status.setAttribute('role', 'status');
    this.dialog.append(
      title,
      this.query,
      this.list,
      this.status,
      this.more,
      cancel,
    );
    this.dialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      this.finish(null);
    });
    this.dialog.addEventListener('close', () => this.finish(null));
    signal.addEventListener('abort', () => this.finish(null), {
      once: true,
      signal: this.lifetime.signal,
    });
    document.body.append(this.dialog);
    this.render();
    this.dialog.showModal();
    this.query.focus();
  }
  private render(): void {
    this.photos.abort();
    this.photos = new AbortController();
    this.list.replaceChildren();
    const search = this.query.value.trim().toLocaleLowerCase();
    for (const contact of this.directory
      .contacts()
      .filter((item) => item.title.toLocaleLowerCase().includes(search)))
      this.list.append(this.row(contact));
    this.status.textContent = this.list.childElementCount
      ? ''
      : t('forward.empty');
    this.more.hidden = !this.directory.more();
  }
  private row(contact: ForwardContact): HTMLElement {
    const button = document.createElement('button'),
      avatar = document.createElement('span'),
      name = document.createElement('span');
    button.type = 'button';
    button.className = 'forward-contact';
    avatar.className = 'contact-avatar';
    avatar.setAttribute('aria-hidden', 'true');
    name.textContent = contact.title;
    paintAvatar(avatar, { label: contact.title, seed: contact.seed });
    button.append(avatar, name);
    button.addEventListener('click', () => this.finish(contact.id));
    observeForwardPhoto({
      host: avatar,
      load: () => this.directory.profile(contact.id),
      signal: this.photos.signal,
      failed: (error) => {
        this.status.textContent = translatedError(
          error instanceof Error
            ? error.message
            : t('forward.photo-unavailable'),
        );
      },
    });
    return button;
  }
  private async loadMore(): Promise<void> {
    this.more.disabled = true;
    try {
      await this.directory.loadMore();
      if (!this.finished) this.render();
    } catch (error: unknown) {
      if (!this.finished)
        this.status.textContent = translatedError(
          error instanceof Error
            ? error.message
            : t('forward.contacts-unavailable'),
        );
    } finally {
      this.more.disabled = false;
    }
  }
  private finish(id: string | null): void {
    if (this.finished) return;
    this.finished = true;
    this.lifetime.abort();
    this.photos.abort();
    this.dialog.close();
    this.dialog.remove();
    this.done(id);
  }
}
