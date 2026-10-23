import { t, translatedError } from '../../shared/i18n/index.ts';
import type { AccountSession } from '../../shared/account/index.ts';
import {
  contactInvitationValue,
  invitationLink,
  readInvitation,
  walletContactFromAddress,
} from '../../shared/contacts/index.ts';
import type {
  AddressBookEntry,
  ContactList,
  DiscoveryMode,
  Invitation,
  Peer,
} from '../../shared/contacts/index.ts';
import type { VaultAccess } from '../vault-authority/index.ts';
import type { VaultSync } from '../vault-sync/index.ts';
import { QrCamera, renderQr } from '../device-qr/index.ts';
import { AddressBook, incomingInvitation } from './agenda.ts';
import { Contacts } from './controller.ts';
import { PrivateContactInvitations } from './invitations.ts';
import { ContactDirectory } from './directory.ts';
import { directoryItems, renderDirectory } from './directory-view.ts';
import { requestContact } from './request-contact.ts';
import { editorTemplate, template, settingsTemplate } from './template.ts';
import {
  bindContactTabs,
  contactRow,
  contactMenu,
  emptyContacts,
  searchContacts,
  selectContactTab,
} from './view.ts';
import { shortAddress } from '../appearance/index.ts';
import { DiscoveryChoices } from './discovery-choices.ts';
import { ContactSettings } from './contact-settings.ts';
import { contactDraft } from './contact-draft.ts';
export function startContacts(
  access: VaultAccess,
  sync: VaultSync,
  options: {
    saved?: (contact: AddressBookEntry) => Promise<void>;
    open?: (peer: Peer) => Promise<void>;
  } = {},
) {
  const contacts = new Contacts(access),
    book = new AddressBook(sync),
    directory = new ContactDirectory(sync);
  const discovery = new DiscoveryChoices();
  const contactSettings = new ContactSettings({
    book,
    sync,
    run,
    saved: async (contact) => {
      await directory.saved(contact);
      await options.saved?.(contact);
    },
  });
  // The page view is remounted per visit; the add/request editor has a
  // persistent host so it can open over any view.
  let mounted: HTMLElement | null = null,
    editor: HTMLElement | null = null,
    busy = false,
    generation = 0,
    offset = 0;
  let status = t('Connect and authorize the device to sync.');
  let found: Peer | null = null,
    received: Invitation | null = null,
    invitePeer: Peer | null = null;
  const invitations = new PrivateContactInvitations({
    owner: () => contacts.session?.accountId ?? null,
    origin: location.origin,
    issue: (hash) => contacts.issueInvitation(hash),
    revoke: (hash) => contacts.revokeInvitation(hash),
  });
  let camera: QrCamera | null = null;
  function node<T extends HTMLElement>(selector: string): T | null {
    return (
      mounted?.querySelector<T>(selector) ??
      editor?.querySelector<T>(selector) ??
      null
    );
  }
  function text(selector: string, value: string): void {
    const n = node(selector);
    if (n) n.textContent = value;
  }
  function value(selector: string): string {
    return node<HTMLInputElement | HTMLSelectElement>(selector)?.value ?? '';
  }
  function button(label: string, work: () => Promise<void>): HTMLButtonElement {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.disabled = busy;
    b.addEventListener('click', () => {
      void run(work);
    });
    return b;
  }
  async function run(work: () => Promise<void>): Promise<void> {
    if (busy) return;
    busy = true;
    const current = generation;
    render();
    try {
      await work();
      if (current === generation) {
        const retry = node('[data-contact-action="refresh"]');
        if (retry) retry.hidden = true;
      }
    } catch (error: unknown) {
      const retry = node('[data-contact-action="refresh"]');
      if (retry) retry.hidden = false;
      if (current === generation)
        status =
          error instanceof Error
            ? translatedError(error.message)
            : t('Operation unavailable. Check the state before retrying.');
    } finally {
      busy = false;
      render();
      if (current !== generation) ready();
    }
  }
  function render(): void {
    text('[data-contact-status]', busy ? t('Updating contacts…') : status);
    text('[data-contact-editor-status]', busy ? t('Processing…') : status);
    text('[data-contact-invite-status]', busy ? t('Processing…') : status);
    renderInvite();
    renderBook();
    renderLists();
    renderPagination();
    for (const root of [mounted, editor])
      root?.querySelectorAll<HTMLButtonElement>('button').forEach((b) => {
        b.disabled = busy;
      });
    const close = node<HTMLButtonElement>('[data-contact-editor-close]');
    if (close) close.disabled = false;
    const inviteClose = node<HTMLButtonElement>('[data-contact-invites-close]');
    if (inviteClose) inviteClose.disabled = false;
  }
  function renderPagination(): void {
    mounted
      ?.querySelectorAll<HTMLButtonElement>('[data-contact-page]')
      .forEach((button) => {
        button.hidden = !contacts.pages.get(
          button.dataset['contactPage'] as ContactList,
        )?.next;
      });
    const next = node('[data-contact-action="book-more"]');
    if (next)
      next.hidden =
        !directory.more &&
        directoryItems({
          saved: directory.entries,
          approved: contacts.pages.get('approved')?.items ?? [],
          outgoing: contacts.pages.get('outgoing')?.items ?? [],
          query: value('[data-book-search]'),
        }).length <=
          offset + 16;
  }
  function renderInvite(): void {
    const ownLink = invitations.link;
    const own = node('[data-contact-own-invite]');
    if (own) own.hidden = !ownLink;
    const input = node<HTMLInputElement>('[data-contact-invite]');
    if (input) input.value = ownLink ?? '';
    const rotate = node('[data-contact-action="rotate"]');
    if (rotate) rotate.textContent = t('Create new invitation');
    if (!ownLink) return;
    const qr = node('[data-contact-invite-qr]');
    if (qr && node<HTMLDialogElement>('[data-contact-invites]')?.open)
      renderQr(qr, ownLink, t('Contact invitation QR code'));
  }
  function resetEditor(): void {
    found = null;
    node<HTMLFormElement>('[data-book-form]')?.reset();
    const address = node<HTMLInputElement>('[data-book-address]');
    if (address) address.readOnly = false;
    text('[data-book-title]', t('Add contact'));
    text('[data-contact-discovery]', '');
    node('[data-contact-discovery-actions]')?.replaceChildren();
  }
  function openEditor(tab: 'wallet' | 'invite'): void {
    const dialog = node<HTMLDialogElement>('[data-contact-editor]');
    const root = editor ?? mounted;
    if (!dialog || !root) return;
    selectContactTab(root, 'editor', tab);
    if (!dialog.open) dialog.showModal();
    dialog
      .querySelector<HTMLInputElement>(
        `[data-contact-panel="editor"][data-tab="${tab}"] input`,
      )
      ?.focus();
  }
  function fillEditor(prefill: { address: string; alias: string }): void {
    const address = node<HTMLInputElement>('[data-book-address]'),
      alias = node<HTMLInputElement>('[data-book-alias]');
    if (address) address.value = prefill.address;
    if (alias) alias.value = prefill.alias;
  }
  function startAdding(): void {
    resetEditor();
    status = t(
      'Saving stores the nickname in contacts; a conversation request requires acceptance.',
    );
    render();
    openEditor('wallet');
  }
  function bindEditor(): void {
    const dialog = node<HTMLDialogElement>('[data-contact-editor]');
    node('[data-contact-editor-close]')?.addEventListener('click', () =>
      dialog?.close(),
    );
    dialog?.addEventListener('close', () => {
      // A queued close from session reset must not clear a reopened invitation.
      if (dialog.open || dialog !== node('[data-contact-editor]')) return;
      camera?.stop();
      resetEditor();
      received = null;
      invitePeer = null;
      node<HTMLFormElement>('[data-contact-invite-form]')?.reset();
      node('[data-contact-invite-peer]')?.replaceChildren();
    });
    node('[data-contact-tab="editor"][data-tab="wallet"]')?.addEventListener(
      'click',
      () => camera?.stop(),
    );
  }
  function bindOwnInvite(): void {
    const dialog = node<HTMLDialogElement>('[data-contact-invites]');
    node('[data-contact-own-open]')?.addEventListener('click', () => {
      dialog?.showModal();
      renderInvite();
    });
    node('[data-contact-invites-close]')?.addEventListener('click', () =>
      dialog?.close(),
    );
  }
  async function refresh(): Promise<void> {
    const deadline = Date.now() + 60_000;
    do {
      if (Date.now() >= deadline)
        throw new Error('Synchronization interrupted. Try again.');
      await sync.refresh();
    } while (!sync.complete);
    if (sync.pending) await sync.retry();
    await contacts.snapshot();
    await directory.load();
    discovery.value = contacts.state.mode;
    status = sync.complete
      ? t('Contacts updated.')
      : t(
          'Permissions verified. Continue loading the vault index before editing contacts.',
        );
    if (received && node('[data-contact-invite-form]')) await inspectInvite();
  }
  function renderBook(): void {
    const list = node('[data-contact-list="approved"]');
    if (!list) return;
    const items = directoryItems({
      saved: directory.entries,
      approved: contacts.pages.get('approved')?.items ?? [],
      outgoing: contacts.pages.get('outgoing')?.items ?? [],
      query: value('[data-book-search]'),
    });
    text(
      '[data-contact-page-state="approved"]',
      t('{0} loaded', [items.length]),
    );
    renderDirectory({
      list,
      items: items.slice(offset, offset + 16),
      button,
      ...(options.open ? { openChat: options.open } : {}),
      openContact: (item) =>
        contactSettings.open(
          item.saved?.contact ?? {
            version: 1,
            ecosystem: item.peer!.ecosystem,
            address: item.peer!.address,
            alias: item.peer!.name,
            accountId: item.peer!.accountId,
            identity: null,
            directory: null,
            identityRevision: 0,
            removed: false,
          },
        ),
    });
  }
  function draft(): AddressBookEntry {
    const address = value('[data-book-address]');
    return contactDraft({
      address,
      alias: value('[data-book-alias]'),
      reference:
        directory.find(walletContactFromAddress(address))?.contact ?? null,
    });
  }
  async function save(): Promise<void> {
    const contact = draft();
    const expected = generation;
    await book.save(contact, null, undefined, () => {
      if (expected !== generation) throw new Error('Session changed.');
    });
    if (expected !== generation) throw new Error('Session changed.');
    await directory.saved(contact);
    await options.saved?.(contact);
    status = sync.pending
      ? t(
          'Contact saved on this device. It will be sent when the connection returns.',
        )
      : t(
          'Private contact confirmed in the vault. This did not approve a conversation.',
        );
    resetEditor();
    node<HTMLDialogElement>('[data-contact-editor]')?.close();
  }
  async function discover(): Promise<void> {
    found = await contacts.discover(
      walletContactFromAddress(value('[data-book-address]')),
    );
    text(
      '[data-contact-discovery]',
      found
        ? t('{0} · user-chosen name · {1} · {2}', [
            found.name || t('Unnamed'),
            found.ecosystem,
            found.address,
          ])
        : t(
            'Wallet unavailable for requests by address. Save it in contacts and share your invitation.',
          ),
    );
    const actions = node('[data-contact-discovery-actions]');
    actions?.replaceChildren();
  }
  function renderLists(): void {
    for (const kind of ['incoming', 'outgoing', 'rejected'] as const) {
      const list = node(`[data-contact-list="${kind}"]`);
      if (!list) continue;
      list.replaceChildren();
      const page = contacts.pages.get(kind);
      const items = searchContacts(
        page?.items ?? [],
        value('[data-book-search]'),
      );
      for (const contact of items) list.append(peerRow(contact, kind));
      if (!items.length) emptyContacts(list, emptyList(kind, !!page));
      text(
        `[data-contact-page-state="${kind}"]`,
        page
          ? t('{0}{1} on this page', [page.items.length, page.next ? '+' : ''])
          : '',
      );
    }
    renderRequestCount();
    renderBlocks();
  }
  function renderRequestCount(): void {
    const count = node('[data-contact-request-count]'),
      incoming = contacts.pages.get('incoming');
    if (count) {
      const amount = incoming?.items.length ?? 0;
      count.hidden = amount === 0;
      count.textContent = `${amount}${incoming?.next ? '+' : ''}`;
      count.setAttribute(
        'aria-label',
        t('Requests received on this page: {0}', [amount]),
      );
    }
  }
  function emptyList(kind: ContactList, loaded: boolean): string {
    if (!loaded) return t('Sign in and sync to check this list.');
    if (value('[data-book-search]'))
      return t("No results in this page's items.");
    const labels = {
      approved: t(
        'No conversations allowed yet. Add a contact or accept a request.',
      ),
      incoming: t('No requests received. New requests appear here.'),
      outgoing: t('You have no sent requests on this page.'),
      rejected: t('No declined requests on this page.'),
      blocked: t('No blocks on this page.'),
    };
    return labels[kind];
  }
  function peerRow(
    contact: Peer & { requester: string },
    kind: ContactList,
  ): HTMLLIElement {
    const title = contact.name || shortAddress(contact.address);
    const { row, actions } = contactRow({
      title,
      seed: contact.address,
      detail: t('{0} · {1}', [
        contact.ecosystem.toUpperCase(),
        shortAddress(contact.address),
      ]),
    });
    if (kind === 'approved' && options.open) {
      const open = options.open;
      const converse = button(t('Chat'), () => open(contact));
      converse.className = 'primary';
      actions.append(converse);
    }
    if (kind === 'incoming') requestActions(actions, contact);
    const menu = contactMenu(actions, title),
      details = document.createElement('details'),
      summary = document.createElement('summary'),
      wallet = document.createElement('p');
    summary.textContent = t('Wallet and provided name');
    wallet.textContent = t('{0} · {1}. User-chosen name.', [
      contact.ecosystem.toUpperCase(),
      contact.address,
    ]);
    details.append(summary, wallet);
    menu.append(
      details,
      button(t('Save to my contacts'), async () => selectPeer(contact)),
    );
    if (kind === 'outgoing')
      menu.append(
        button(t('Cancel request'), async () => {
          await contacts.api('cancel', {
            revision: contacts.state.revision,
            target: contact.accountId,
          });
          await refresh();
          status = t('Pending request cancelled.');
        }),
      );
    return row;
  }
  function requestActions(actions: HTMLElement, contact: Peer): void {
    const accept = button(t('Accept'), async () => {
      await contacts.respond(contact.accountId, true);
      await refresh();
      status = t('Contact approved in both directions.');
    });
    accept.className = 'primary';
    actions.append(
      accept,
      button(t('Decline'), async () => {
        await contacts.respond(contact.accountId, false);
        await refresh();
        status = t(
          'Request declined. The same identity cannot repeat this request.',
        );
      }),
    );
  }
  function renderBlocks(): void {
    const list = node('[data-contact-list="blocked"]');
    if (!list) return;
    list.replaceChildren();
    const query = value('[data-book-search]').trim().toLowerCase();
    for (const hash of contacts.pages.get('blocked')?.blocks ?? []) {
      if (!hash.toLowerCase().includes(query)) continue;
      const { row, actions } = contactRow({
        title: t('Blocked wallet'),
        seed: hash,
        detail: t('Reference · {0}', [shortAddress(hash)]),
      });
      const menu = contactMenu(actions, t('block {0}', [shortAddress(hash)])),
        reference = document.createElement('p');
      reference.textContent = t('Block reference: {0}', [hash]);
      menu.append(reference);
      actions.prepend(
        button(t('Unblock'), async () => {
          await contacts.api('unblock', {
            revision: contacts.state.revision,
            walletHash: hash,
          });
          await refresh();
          status = t(
            'Block removed. A new request and approval are still required.',
          );
        }),
      );
      list.append(row);
    }
    if (!list.childElementCount)
      emptyContacts(list, emptyList('blocked', contacts.pages.has('blocked')));
  }
  async function selectPeer(contact: Peer): Promise<void> {
    resetEditor();
    const a = node<HTMLInputElement>('[data-book-address]'),
      alias = node<HTMLInputElement>('[data-book-alias]');
    if (a) a.value = contact.address;
    if (alias) alias.value = contact.name;
    status = t(
      'Check the private nickname and explicitly save it in contacts.',
    );
    openEditor('wallet');
    await Promise.resolve();
  }
  async function configure(): Promise<void> {
    await contacts.configure(discovery.value, contacts.state.inviteHash);
    status = t(
      'Visibility applied on the server. Previously approved contacts were preserved.',
    );
  }
  async function rotate(): Promise<void> {
    await invitations.create();
    status = t(
      'Invitation ready: one use, valid for 24 hours. Previous invitations remain valid.',
    );
  }
  async function inspectInvite(): Promise<void> {
    const link = value('[data-contact-received]');
    if (link) received = readInvitation(link, location.origin);
    if (!received) throw new Error('Enter a valid invitation.');
    invitePeer = await contacts.invite(received);
    const target = node('[data-contact-invite-peer]');
    target?.replaceChildren();
    if (!invitePeer) {
      status = t(
        'Invitation unavailable, revoked or restricted by current privacy settings.',
      );
      return;
    }
    const selected = invitePeer,
      invite = received;
    const p = document.createElement('p');
    p.textContent = t('{0} · user-chosen name · {1} · {2}', [
      selected.name || t('Unnamed'),
      selected.ecosystem,
      selected.address,
    ]);
    target?.append(p);
    if (!node('[data-contact-invite-form]'))
      target?.append(
        button(t('Request conversation'), () =>
          requestInvite(selected, invite.token),
        ),
      );
  }
  async function requestInvite(selected: Peer, token: string): Promise<void> {
    const expected = generation;
    const contact = await requestContact({
      contacts,
      book,
      sync,
      peer: selected,
      token,
      alias: '',
      guard: () => {
        if (expected !== generation) throw new Error('Session changed.');
      },
    });
    await directory.saved(contact);
    await options.saved?.(contact);
    received = null;
    invitePeer = null;
    node('[data-contact-invite-peer]')?.replaceChildren();
    await refresh();
    status = t('Request sent. Wait for acceptance.');
  }
  async function sendInvite(): Promise<void> {
    await inspectInvite();
    if (invitePeer && received) await requestInvite(invitePeer, received.token);
  }
  async function requestWallet(): Promise<void> {
    await discover();
    if (found) {
      const expected = generation;
      const contact = await requestContact({
        contacts,
        book,
        sync,
        peer: found,
        token: null,
        alias: value('[data-book-alias]'),
        guard: () => {
          if (expected !== generation) throw new Error('Session changed.');
        },
      });
      await directory.saved(contact);
      await options.saved?.(contact);
      await refresh();
      status = t('Request sent. Wait for acceptance.');
    }
  }
  const actions: Record<string, () => Promise<void>> = {
    refresh,
    discover: requestWallet,
    rotate,
    revoke: async () => {
      await invitations.revoke();
      status = t(
        'This invitation was revoked. Other invitations remain valid.',
      );
    },
    copy: async () => {
      const ownLink = invitations.link;
      if (!ownLink) throw new Error('Create an invitation first.');
      await navigator.clipboard.writeText(ownLink);
      status = t('Link copied. Share it manually with the recipient.');
    },
    'book-more': async () => {
      if (directory.more) await directory.load(true);
      offset += 16;
    },
    scan: async () => {
      camera?.start('invitation');
      await Promise.resolve();
    },
    'stop-camera': async () => {
      camera?.stop();
      await Promise.resolve();
    },
  };
  /** Typed wallets, links and searches never outlive the session. */
  function clearInputs(): void {
    for (const root of [mounted, editor])
      root?.querySelectorAll<HTMLInputElement>('input').forEach((n) => {
        n.value = '';
      });
  }
  function clear(): void {
    generation++;
    discovery.clear();
    contactSettings.clear();
    camera?.stop();
    node<HTMLDialogElement>('[data-contact-editor]')?.close();
    node<HTMLDialogElement>('[data-contact-invites]')?.close();
    contacts.clear();
    directory.clear();
    invitations.clear();
    found = null;
    invitePeer = null;
    clearInputs();
    node('[data-contact-invite-peer]')?.replaceChildren();
    node('[data-contact-discovery-actions]')?.replaceChildren();
    for (const selector of ['[data-contact-invite-qr]']) {
      const qr = node(selector);
      qr?.replaceChildren();
      if (qr) delete qr.dataset['qrPayload'];
    }
    status = t('Checking account contacts…');
  }
  function sessionChanged(session: AccountSession | null): boolean {
    return (
      session?.accountId !== contacts.session?.accountId ||
      session?.csrf !== contacts.session?.csrf ||
      session?.deviceId !== contacts.session?.deviceId
    );
  }
  function showReceivedInvite(): void {
    if (!received) return;
    const input = node<HTMLInputElement>('[data-contact-received]');
    if (input) input.value = invitationLink(location.origin, received);
    openEditor('invite');
  }
  function readIncomingInvite(): void {
    try {
      const invite = incomingInvitation(location.hash, location.origin);
      if (!invite) return;
      received = invite;
    } catch {
      received = null;
      status = t('Invalid invitation. Check the full link.');
    }
    if (contactInvitationValue(location.hash) !== null)
      history.replaceState(null, '', location.pathname + '#contacts');
  }
  function mountCamera(): void {
    const video = node<HTMLVideoElement>('[data-contact-camera]');
    if (!video) return;
    camera = new QrCamera({
      video,
      state: (active) => {
        video.hidden = !active;
        const stop = node('[data-contact-action="stop-camera"]');
        if (stop) stop.hidden = !active;
      },
      failed: (message) => {
        status = message;
        render();
      },
      decoded: (link) => {
        const input = node<HTMLInputElement>('[data-contact-received]');
        if (input) input.value = link;
        void run(inspectInvite);
      },
    });
  }
  function restoreForm(values: { selector: string; value: string }[]): void {
    for (const saved of values) {
      const input = node<HTMLInputElement | HTMLSelectElement>(saved.selector);
      if (input && saved.value) input.value = saved.value;
    }
  }
  async function loadLocal(): Promise<void> {
    await sync.openLocal();
    await directory.load();
  }
  /** Action buttons and forms of one root: the page view or the editor host. */
  function bindControls(root: HTMLElement): void {
    root
      .querySelectorAll<HTMLButtonElement>('[data-contact-action]')
      .forEach((b) =>
        b.addEventListener('click', () => {
          const action = actions[b.dataset['contactAction'] ?? ''];
          if (action) void run(action);
        }),
      );
    for (const [selector, action] of [
      ['[data-book-form]', save],
      ['[data-contact-settings]', configure],
      ['[data-contact-invite-form]', sendInvite],
    ] as const)
      root
        .querySelector<HTMLFormElement>(selector)
        ?.addEventListener('submit', (event) => {
          event.preventDefault();
          void run(action);
        });
  }
  window.addEventListener('pagehide', () => {
    clear();
    received = null;
    render();
  });
  function ready(): void {
    if (mounted?.isConnected && contacts.session && navigator.onLine)
      void run(refresh);
  }
  return {
    ready,
    /** Who may request a conversation, read from the server; used by Initial settings. */
    async discovery(): Promise<DiscoveryMode> {
      await contacts.refresh();
      return contacts.state.mode;
    },
    /** Same signed configure as Privacidade; the private invite stays as it is. */
    async setDiscovery(mode: DiscoveryMode): Promise<void> {
      await contacts.refresh();
      if (contacts.state.mode === mode) return;
      await contacts.configure(mode, contacts.state.inviteHash);
      render();
    },
    /** Received requests for Activity; same signed API and checks as Contacts → Requests. */
    async incomingRequests(): Promise<readonly Peer[]> {
      const previousRevision = contacts.state.revision;
      const incoming = await contacts.snapshot({ preservePages: true });
      if (
        mounted?.isConnected &&
        !busy &&
        previousRevision !== contacts.state.revision
      )
        render();
      return incoming.items;
    },
    async respondRequest(accountId: string, accept: boolean): Promise<void> {
      await contacts.respond(accountId, accept);
      if (mounted?.isConnected) await refresh();
    },
    showContact(contact: AddressBookEntry, container?: HTMLElement): void {
      if (container) contactSettings.mount(container);
      void contactSettings.open(contact);
    },
    closeContact: () => contactSettings.clear(),
    /** Sidebar shortcut, or a group member's wallet: the add editor opens
     * over the current view, using the same save/request flow. */
    addContact(prefill?: { address: string; alias: string }): void {
      const dialog = node<HTMLDialogElement>('[data-contact-editor]');
      // Never replace an editor already in use (e.g. a received invitation).
      if (!dialog || dialog.open) return;
      startAdding();
      if (prefill) fillEditor(prefill);
      // Outside Contacts the saved directory may be unread; existing entries
      // must be found so an edit keeps their identity.
      if (!mounted?.isConnected) void run(loadLocal);
    },
    /** Called once with a host that stays in the document for the session. */
    mountEditor(host: HTMLElement): void {
      if (editor) return;
      editor = host;
      host.innerHTML = editorTemplate;
      bindContactTabs(host);
      bindEditor();
      bindControls(host);
      mountCamera();
      render();
    },
    setSession(session: AccountSession | null): void {
      const firstConnection = !contacts.session && session !== null;
      if (sessionChanged(session)) clear();
      if (!session) received = null;
      contacts.setSession(session);
      if (firstConnection) showReceivedInvite();
      render();
    },
    canActivate: () =>
      !busy &&
      !contactSettings.active &&
      !camera?.active &&
      !node<HTMLDialogElement>('[data-contact-editor]')?.open &&
      !node<HTMLDialogElement>('[data-contact-invites]')?.open &&
      !value('[data-book-address]') &&
      !value('[data-contact-received]'),
    mount(
      container: HTMLElement,
      mode: 'contacts' | 'settings' = 'contacts',
    ): void {
      // A tab return reattaches the same view. Its events, loaded pages and
      // current search remain owned by this session's contact controller.
      if (mounted === container) {
        render();
        return;
      }
      const formValues = ['[data-book-search]'].map((selector) => ({
        selector,
        value: value(selector),
      }));
      mounted = container;
      container.innerHTML = mode === 'settings' ? settingsTemplate : template;
      discovery.mount(container);
      contactSettings.mount(container);
      restoreForm(formValues);
      bindContactTabs(container);
      container
        .querySelector('[data-contact-add]')
        ?.addEventListener('click', startAdding);
      bindOwnInvite();
      readIncomingInvite();
      showReceivedInvite();
      bindControls(container);
      container
        .querySelectorAll<HTMLButtonElement>('[data-contact-page]')
        .forEach((b) =>
          b.addEventListener('click', () => {
            void run(async () => {
              await contacts.list(
                b.dataset['contactPage'] as ContactList,
                true,
              );
              offset = 0;
            });
          }),
        );
      node('[data-book-search]')?.addEventListener('input', () => {
        offset = 0;
        renderBook();
        renderLists();
        renderPagination();
      });
      render();
      void run(async () => {
        if (navigator.onLine && contacts.session) await refresh();
        else await loadLocal();
      });
    },
  };
}

export { bindContactShortcuts } from './shortcuts.ts';
export { Contacts, checkPinnedIdentity } from './controller.ts';
export { AddressBook, walletEntity, walletKey } from './agenda.ts';
export type { BookVersion } from './agenda.ts';

export { ContactDirectory, agendaContact } from './directory.ts';
export type { SavedContact } from './directory.ts';
