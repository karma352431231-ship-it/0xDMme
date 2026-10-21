import {
  t,
  translatedError,
  currentLanguage,
} from '../../shared/i18n/index.ts';
import { dropFilesInto } from '../file-drop/index.ts';
import type { AccountSession } from '../../shared/account/index.ts';
import type { Peer } from '../../shared/contacts/index.ts';
import { attachmentContent } from '../../shared/attachments/index.ts';
import { statusIsActive } from '../../shared/status/index.ts';
import type { VaultAccess } from '../vault-authority/index.ts';
import type { VaultSync } from '../vault-sync/index.ts';
import type { LiveEvent } from '../message-live/index.ts';
import { Contacts } from '../contacts/index.ts';
import { prepareAttachment } from '../attachments/index.ts';
import type { AttachmentSelection } from '../attachments/index.ts';
import { EmojiPicker, emojiIntoComposer, emojiText } from '../emoji/index.ts';
import { StatusController } from './controller.ts';
import type { StatusView } from './controller.ts';
export function startStatus(access: VaultAccess, sync: VaultSync) {
  const controller = new StatusController(access, sync),
    contacts = new Contacts(access),
    emoji = new EmojiPicker();
  let session: AccountSession | null = null,
    host: HTMLElement | null = null,
    busy = false,
    queued = false,
    connected = false;
  let peers: Peer[] = [],
    moreContacts: string | null = null,
    view: StatusView | null = null,
    selection: AttachmentSelection | null = null;
  let notice = t('Sign in and authorize this device to open statuses.'),
    generation = 0;
  const urls = new Set<string>();
  let preview: string | null = null;
  let expiryTimer: ReturnType<typeof setTimeout> | null = null;
  function node<T extends HTMLElement>(selector: string): T | null {
    return host?.querySelector<T>(selector) ?? null;
  }
  function clearOpened(): void {
    if (expiryTimer !== null) clearTimeout(expiryTimer);
    expiryTimer = null;
    view = null;
    for (const url of urls) URL.revokeObjectURL(url);
    urls.clear();
    node('[data-status-open]')?.replaceChildren();
  }
  function clearSelection(): void {
    selection?.bytes.fill(0);
    selection?.thumbnail?.fill(0);
    selection = null;
    if (preview) URL.revokeObjectURL(preview);
    preview = null;
    node('[data-status-preview]')?.replaceChildren();
    const file = node<HTMLInputElement>('[data-status-file]');
    if (file) file.value = '';
  }
  function status(): void {
    const text = node('[data-status-notice]');
    if (text) text.textContent = notice;
    host
      ?.querySelectorAll<
        HTMLButtonElement | HTMLInputElement | HTMLTextAreaElement
      >('button,input,textarea')
      .forEach((control) => {
        control.disabled = busy;
      });
    draftStatus();
    paginationStatus();
  }
  function draftStatus(): void {
    const submit = node<HTMLButtonElement>('[data-status-publish]');
    if (submit)
      submit.textContent = controller.pending
        ? t('Retry publication')
        : t('Publish status');
    const cancel = node<HTMLButtonElement>('[data-status-cancel]');
    if (cancel) cancel.hidden = !controller.pending;
    const input = node<HTMLTextAreaElement>('[data-status-text]');
    if (input) input.disabled = busy || controller.pending;
    const file = node<HTMLInputElement>('[data-status-file]');
    if (file) file.disabled = busy || controller.pending;
  }
  function paginationStatus(): void {
    const more = node('[data-status-more]');
    if (more) more.hidden = controller.next === null;
    const nextContacts = node('[data-status-more-contacts]');
    if (nextContacts) nextContacts.hidden = moreContacts === null;
  }
  async function run(work: () => Promise<void>): Promise<void> {
    if (busy) {
      queued = true;
      return;
    }
    busy = true;
    const current = generation;
    status();
    try {
      await work();
    } catch (error: unknown) {
      if (current === generation) {
        clearOpened();
        notice =
          error instanceof Error
            ? translatedError(error.message)
            : t('Could not complete the status.');
      }
    } finally {
      busy = false;
      status();
      if (queued && host?.isConnected && session && navigator.onLine) {
        queued = false;
        void run(refresh);
      }
    }
  }
  function name(account: string): string {
    return account === session?.accountId
      ? t('You')
      : peers.find((p) => p.accountId === account)?.name ||
          t('Contact {0}', [account.slice(0, 8)]);
  }
  function renderList(): void {
    const list = node('[data-status-list]');
    if (!list) return;
    list.replaceChildren();
    const items = controller.items.filter((item) =>
      statusIsActive({ publishedAt: item.publishedAt, now: Date.now() }),
    );
    for (const item of items) {
      const article = document.createElement('article'),
        button = document.createElement('button');
      article.className = 'status-row';
      button.type = 'button';
      button.textContent = t('{0} · {1} · {2}', [
        name(item.author),
        item.kind === 'photo' ? t('Photo') : t('Text'),
        new Date(item.publishedAt).toLocaleString(currentLanguage()),
      ]);
      button.addEventListener(
        'click',
        () =>
          void run(async () => {
            clearOpened();
            view = await controller.open(item.id);
            renderOpened();
            notice = t('Status opened.');
          }),
      );
      article.append(button);
      if (item.author === session?.accountId) {
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.textContent = t('Delete');
        remove.addEventListener('click', () => {
          if (!window.confirm(t('Delete this status?'))) return;
          void run(async () => {
            await controller.remove(item.id);
            clearOpened();
            renderList();
            notice = t('Status deleted.');
          });
        });
        article.append(remove);
      }
      list.append(article);
    }
    if (!items.length) list.textContent = t('No active statuses on this page.');
  }
  async function openNewest(author: string): Promise<void> {
    const item = controller.items.find(
      (candidate) =>
        candidate.author === author &&
        statusIsActive({ publishedAt: candidate.publishedAt, now: Date.now() }),
    );
    if (!item) {
      notice = t('This status has expired or is not on this page.');
      return;
    }
    clearOpened();
    view = await controller.open(item.id);
    renderOpened();
    notice = t('Status opened.');
  }
  function renderOpened(): void {
    const container = node('[data-status-open]');
    if (!container || !view) return;
    scheduleExpiry(view);
    const heading = document.createElement('h3');
    heading.textContent = name(view.item.author);
    container.append(heading);
    const text = document.createElement('p');
    if (view.item.kind === 'text') {
      emojiText(text, view.text);
      container.append(text);
      return;
    }
    const content = attachmentContent(JSON.parse(view.text) as unknown);
    emojiText(text, content.caption);
    container.append(text);
    const photo = document.createElement('button');
    photo.type = 'button';
    photo.textContent = t('Open photo');
    photo.addEventListener(
      'click',
      () =>
        void run(async () => {
          const opened = view;
          if (!opened) return;
          const bytes = await controller.photo(false);
          if (view !== opened) {
            bytes.fill(0);
            return;
          }
          const url = URL.createObjectURL(
            new Blob([bytes], { type: content.type }),
          );
          bytes.fill(0);
          urls.add(url);
          const image = document.createElement('img');
          image.src = url;
          image.alt = content.caption || t('Status photo');
          image.className = 'attachment-image';
          photo.replaceWith(image);
        }),
    );
    container.append(photo);
  }
  function scheduleExpiry(opened: StatusView): void {
    if (expiryTimer !== null) clearTimeout(expiryTimer);
    expiryTimer = setTimeout(
      () => {
        if (view !== opened) return;
        controller.hide();
        clearOpened();
        renderList();
        notice = t('This status expired.');
        status();
      },
      Math.max(0, opened.item.publishedAt + 86400000 - Date.now()),
    );
  }
  function renderAudience(): void {
    const list = node('[data-status-audience]');
    if (!list) return;
    list.replaceChildren();
    for (const peer of peers) {
      const label = document.createElement('label'),
        checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = !controller.preferences.excluded.has(peer.accountId);
      checkbox.dataset['statusAudience'] = peer.accountId;
      label.append(
        checkbox,
        document.createTextNode(peer.name || peer.address),
      );
      list.append(label);
    }
    const conflict = node('[data-status-privacy-conflict]');
    if (conflict) {
      conflict.hidden = !controller.preferences.conflict;
      conflict.textContent = t(
        'Your devices have different choices. Deletions were combined; check and save the list to resolve.',
      );
    }
  }
  async function refreshContacts(more = false): Promise<void> {
    const page = await contacts.list('approved', more);
    peers = more
      ? [
          ...peers,
          ...page.items.filter(
            (p) => !peers.some((old) => old.accountId === p.accountId),
          ),
        ]
      : page.items;
    moreContacts = page.next;
    renderAudience();
  }
  async function refresh(): Promise<void> {
    if (!host?.isConnected || !session) return;
    clearOpened();
    await controller.refresh();
    await refreshContacts();
    renderList();
    notice = controller.pending
      ? t(
          'Publication pending. Resume or cancel the upload before preparing another status.',
        )
      : t(
          'Statuses last 24 hours. Approved contacts can see them, subject to the exclusions below.',
        );
  }
  async function prepare(): Promise<void> {
    const file = node<HTMLInputElement>('[data-status-file]')?.files?.[0];
    if (!file) return;
    const current = generation,
      next = await prepareAttachment(file, true);
    if (current !== generation || !host?.isConnected) {
      next.bytes.fill(0);
      next.thumbnail?.fill(0);
      return;
    }
    clearSelection();
    selection = next;
    preview = URL.createObjectURL(
      new Blob([next.thumbnail ?? next.bytes], { type: next.type }),
    );
    const image = document.createElement('img');
    image.src = preview;
    image.alt = t('Next status preview');
    image.className = 'attachment-image';
    node('[data-status-preview]')?.append(image);
    notice = t('Check the photo and tap Publish status.');
  }
  function bind(selector: string, action: () => void): void {
    node(selector)?.addEventListener('click', action);
  }
  function bindControls(): void {
    const photo = node<HTMLInputElement>('[data-status-file]'),
      compose = node<HTMLFormElement>('[data-status-compose]');
    node('[data-status-attach]')?.addEventListener('click', () =>
      photo?.click(),
    );
    // Dropping a photo on the form works like the clip.
    if (photo && compose) dropFilesInto(compose, photo);
    node<HTMLFormElement>('[data-status-compose]')?.addEventListener(
      'submit',
      (event) => {
        event.preventDefault();
        void run(async () => {
          notice = t('Publishing status…');
          status();
          await controller.publish(
            node<HTMLTextAreaElement>('[data-status-text]')?.value ?? '',
            selection,
          );
          clearSelection();
          const text = node<HTMLTextAreaElement>('[data-status-text]');
          if (text) text.value = '';
          await refresh();
          notice = t('Status published.');
        });
      },
    );
    node('[data-status-file]')?.addEventListener(
      'change',
      () => void run(prepare),
    );
    bind('[data-status-clear-photo]', () => {
      if (!controller.pending) clearSelection();
    });
    bind(
      '[data-status-cancel]',
      () =>
        void run(async () => {
          await controller.cancel();
          clearSelection();
          notice = t('Publication cancelled.');
        }),
    );
    bind('[data-status-refresh]', () => void run(refresh));
    bind(
      '[data-status-more]',
      () =>
        void run(async () => {
          await controller.refresh(true);
          renderList();
        }),
    );
    bind(
      '[data-status-more-contacts]',
      () => void run(() => refreshContacts(true)),
    );
    bind(
      '[data-status-save-audience]',
      () =>
        void run(async () => {
          const excluded = new Set(controller.preferences.excluded);
          host
            ?.querySelectorAll<HTMLInputElement>('[data-status-audience] input')
            .forEach((checkbox) => {
              const account = checkbox.dataset['statusAudience'];
              if (!account) return;
              if (checkbox.checked) excluded.delete(account);
              else excluded.add(account);
            });
          await controller.preferences.save(excluded);
          renderAudience();
          notice = t(
            'Privacy saved for future statuses. Current publications retain their audience.',
          );
        }),
    );
    bind('[data-status-emoji]', () => {
      const input = node<HTMLTextAreaElement>('[data-status-text]'),
        anchor = node('[data-status-emoji]');
      if (!input || !anchor || controller.pending) return;
      void emojiIntoComposer(emoji, anchor, input).catch(() => {
        notice = t('Could not open emoji.');
        status();
      });
    });
  }
  function leave(): void {
    generation++;
    controller.hide();
    clearOpened();
    emoji.close();
    host = null;
  }
  const timer = setInterval(() => {
    if (
      view &&
      !statusIsActive({ publishedAt: view.item.publishedAt, now: Date.now() })
    ) {
      controller.hide();
      clearOpened();
      notice = t('This status expired.');
      status();
    }
    renderList();
    if (
      !connected &&
      !busy &&
      host?.isConnected &&
      session &&
      navigator.onLine &&
      document.visibilityState === 'visible'
    )
      void run(refresh);
  }, 30000);
  window.addEventListener('offline', () => {
    controller.hide();
    clearOpened();
    notice = t('Connect to open current statuses.');
    status();
  });
  window.addEventListener('online', () => {
    if (host?.isConnected) void run(refresh);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      controller.hide();
      clearOpened();
    } else if (host?.isConnected) void run(refresh);
  });
  window.addEventListener('pagehide', (event) => {
    controller.hide();
    clearOpened();
    if (!event.persisted) {
      clearInterval(timer);
      clearSelection();
      controller.setSession(null);
      emoji.reset();
    }
  });
  return {
    setSession(value: AccountSession | null): void {
      if (
        value?.accountId !== session?.accountId ||
        value?.deviceId !== session?.deviceId ||
        value?.csrf !== session?.csrf
      ) {
        generation++;
        clearOpened();
        clearSelection();
        peers = [];
        emoji.reset();
      }
      session = value;
      controller.setSession(value);
      contacts.setSession(value);
      status();
    },
    ready(): void {
      if (host?.isConnected && !busy) void run(refresh);
    },
    /** Authors in the first status page, for the rings in the conversation list. */
    async activeAuthors(): Promise<ReadonlySet<string>> {
      await controller.refresh();
      const now = Date.now();
      return new Set(
        controller.items
          .filter((item) => item.expiresAt > now)
          .map((item) => item.author),
      );
    },
    liveConnection(value: boolean): void {
      connected = value;
    },
    event(signal: LiveEvent): void {
      const event = scopedLiveEvent(signal, ['status', 'contacts', 'vault']);
      if (!event || event === 'call') return;
      if (event === 'authorization') return;
      clearOpened();
      if (['invalidated', 'revoked', 'ended'].includes(event)) {
        controller.hide();
        notice = t("Check this device's authorization to open statuses.");
        status();
      }
      if (host?.isConnected) {
        if (busy) queued = true;
        else void run(refresh);
      }
    },
    leave,
    canActivate: () => !busy && !selection && !controller.pending,
    /** `author` opens that contact's newest active status (from the status row). */
    mount(container: HTMLElement, author: string | null = null): void {
      host = container;
      container.innerHTML = t('html.198650fde984');
      bindControls();
      renderList();
      status();
      if (session && navigator.onLine)
        void run(async () => {
          await refresh();
          if (author) await openNewest(author);
        });
    },
  };
}
import { scopedLiveEvent } from '../message-live/scope.ts';
