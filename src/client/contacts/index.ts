import { networkAvailable } from '../connectivity/index.ts';
import { refreshContactSources } from './refresh.ts';
import { ContactsScreenDiagnostics } from './diagnostics.ts';
import {
  loadingPresentation,
  timedLoad,
} from '../chat-sync-diagnostics/index.ts';
import { applicationOrigin } from '../application-origin/index.ts';
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
import { showToast } from '../toast/index.ts';
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
import { contactDraft, draftChangesStored } from './contact-draft.ts';
import { bindEditorFields, renderWalletPreview } from './editor-fields.ts';
import { AcceptedRequest } from './accepted-request.ts';
/** What saving a typed wallet did besides keeping the encrypted contact. */
type WalletSaveOutcome = 'sent' | 'invite-only' | 'offline' | 'saved';

export function startContacts(
  access: VaultAccess,
  sync: VaultSync,
  options: {
    saved?: (contact: AddressBookEntry) => Promise<void>;
    open?: (peer: Peer) => Promise<void>;
    peerPhoto?: (host: HTMLElement, peer: string, signal: AbortSignal) => void;
  } = {},
) {
  const contacts = new Contacts(access),
    book = new AddressBook(sync),
    directory = new ContactDirectory(sync);
  const loading = loadingPresentation('contacts');
  const screenDiagnostics = new ContactsScreenDiagnostics();
  const discovery = new DiscoveryChoices();
  const requests = new AcceptedRequest();
  const contactSettings = new ContactSettings({
    book,
    sync,
    run,
    requestable: (contact) => !connected(contact),
    request: async (contact) => {
      contactSettings.clear();
      startAdding();
      fillEditor({ address: contact.address, alias: contact.alias });
      // The contact is already saved; only the request can be missing.
      if (!(await requestWallet())) showInviteOnly(true);
      else if (!requests.offered)
        confirmed(t('Request sent. Wait for acceptance.'));
    },
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
  // Dialogs show only what went wrong; confirmations reach the person as toasts.
  let problem = '';
  let found: Peer | null = null,
    received: Invitation | null = null,
    invitePeer: Peer | null = null;
  const invitations = new PrivateContactInvitations({
    owner: () => contacts.session?.accountId ?? null,
    origin: applicationOrigin(),
    issue: (hash) => contacts.issueInvitation(hash),
    revoke: (hash) => contacts.revokeInvitation(hash),
  });
  let camera: QrCamera | null = null;
  const boundInviteButtons = new WeakSet<Element>();
  // Photo loads belong to one directory render; the next render cancels them.
  let directoryPhotos = new AbortController();
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
    requests.dismiss();
    problem = '';
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
        failed(
          error instanceof Error
            ? translatedError(error.message)
            : t('Operation unavailable. Check the state before retrying.'),
        );
    } finally {
      busy = false;
      render();
      if (current !== generation) ready();
    }
  }
  function failed(message: string): void {
    status = message;
    problem = message;
  }
  function confirmed(message: string): void {
    status = message;
    showToast(message);
  }
  function render(): void {
    text('[data-contact-status]', busy ? t('Updating contacts…') : status);
    text('[data-contact-editor-status]', problem);
    renderNextChat();
    renderInvite();
    renderBook();
    renderLists();
    renderPagination();
    loading.presented(mounted);
    for (const root of [mounted, editor])
      root?.querySelectorAll<HTMLButtonElement>('button').forEach((b) => {
        b.disabled = busy;
      });
    const close = node<HTMLButtonElement>('[data-contact-editor-close]');
    if (close) close.disabled = false;
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
    editor
      ?.querySelectorAll<HTMLElement>(
        '[data-contact-action="copy"], [data-contact-action="revoke"]',
      )
      .forEach((control) => {
        control.hidden = !ownLink;
      });
    if (!ownLink) return;
    const qr = node('[data-contact-invite-qr]');
    if (qr && ownInviteShown())
      renderQr(qr, ownLink, t('Contact invitation QR code'));
  }
  function ownInviteShown(): boolean {
    const panel = node('[data-contact-panel="editor"][data-tab="own"]');
    return (
      !!panel &&
      !panel.hidden &&
      !!node<HTMLDialogElement>('[data-contact-editor]')?.open
    );
  }
  /** The Create invitation tab shows the link in memory, or creates one. */
  function showOwnInvite(): void {
    camera?.stop();
    renderInvite();
    if (!invitations.link) void run(rotate);
  }
  function resetEditor(): void {
    found = null;
    node<HTMLFormElement>('[data-book-form]')?.reset();
    const address = node<HTMLInputElement>('[data-book-address]');
    if (address) address.readOnly = false;
    text('[data-book-title]', t('Add contact'));
    showInviteOnly(false);
    if (editor) renderWalletPreview(editor);
  }
  /** After a save whose wallet accepts invitations only: say so in place. */
  function showInviteOnly(shown: boolean): void {
    const outcome = node('[data-contact-outcome]');
    if (outcome) outcome.hidden = !shown;
  }
  function openEditor(tab: 'wallet' | 'invite' | 'own'): void {
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
    if (editor) renderWalletPreview(editor);
  }
  function startAdding(): void {
    resetEditor();
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
    });
    node('[data-contact-tab="editor"][data-tab="wallet"]')?.addEventListener(
      'click',
      () => camera?.stop(),
    );
    node('[data-contact-tab="editor"][data-tab="own"]')?.addEventListener(
      'click',
      showOwnInvite,
    );
    // A new address replaces the previous save's outcome.
    node('[data-book-address]')?.addEventListener('input', () =>
      showInviteOnly(false),
    );
    node('[data-contact-share-invite]')?.addEventListener('click', () => {
      if (editor) selectContactTab(editor, 'editor', 'own');
      showOwnInvite();
    });
  }
  /** My invitation on the Contacts page opens the editor's own invitation tab. */
  function bindOwnInvite(): void {
    mounted?.querySelectorAll('[data-contact-own-open]').forEach((button) => {
      if (boundInviteButtons.has(button)) return;
      boundInviteButtons.add(button);
      button.addEventListener('click', () => {
        if (!node<HTMLDialogElement>('[data-contact-editor]')?.open)
          resetEditor();
        openEditor('own');
        showOwnInvite();
      });
    });
  }
  async function refresh(): Promise<void> {
    return loading.run(async (trace) => {
      const rows = await refreshContactSources({
        sync,
        contacts,
        directory,
        trace,
      });
      discovery.value = contacts.state.mode;
      status = sync.complete
        ? t('Contacts updated.')
        : t(
            'Permissions verified. Continue loading the vault index before editing contacts.',
          );
      if (received && node('[data-contact-invite-form]')) await inspectInvite();
      noticeAccepted();
      return rows;
    });
  }
  /** The request sent from here was accepted: say so and offer the chat. */
  function noticeAccepted(): boolean {
    const peer = requests.settle(contacts.pages.get('approved')?.items ?? []);
    if (!peer) return false;
    status = t('{0} accepted your request. You can start the conversation.', [
      peer.name || shortAddress(peer.address),
    ]);
    return true;
  }
  function renderNextChat(): void {
    const open = options.open;
    const hosts = [mounted, editor].flatMap((root) => [
      ...(root?.querySelectorAll<HTMLElement>('.contact-feedback') ?? []),
    ]);
    if (!open || busy) {
      for (const host of hosts)
        host.querySelector('[data-contact-next-chat]')?.remove();
      return;
    }
    requests.render(hosts, (peer) => {
      node<HTMLDialogElement>('[data-contact-editor]')?.close();
      void run(() => open(peer));
    });
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
    directoryPhotos.abort();
    directoryPhotos = new AbortController();
    renderDirectory({
      list,
      items: items.slice(offset, offset + 16),
      button,
      signal: directoryPhotos.signal,
      ...(options.peerPhoto ? { peerPhoto: options.peerPhoto } : {}),
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
  /** Approved or pending-out wallets need no new request. */
  function connected(contact: { ecosystem: string; address: string }): boolean {
    return (['approved', 'outgoing'] as const).some((kind) =>
      contacts.pages
        .get(kind)
        ?.items.some(
          (peer) =>
            peer.ecosystem === contact.ecosystem &&
            peer.address === contact.address,
        ),
    );
  }
  async function store(contact: AddressBookEntry): Promise<void> {
    const expected = generation;
    await book.save(contact, null, undefined, () => {
      if (expected !== generation) throw new Error('Session changed.');
    });
    if (expected !== generation) throw new Error('Session changed.');
    await directory.saved(contact);
    await options.saved?.(contact);
  }
  /** The dialog's single action: keep the encrypted contact and, when the
   * wallet accepts requests by address, send the existing signed request. */
  async function saveWallet(): Promise<void> {
    const typed = draft();
    const outcome = await requestTypedWallet(typed);
    // A sent request already stored the peer with its identity; the draft is
    // rebuilt so a nickname edit keeps that identity.
    const stored = directory.find(walletContactFromAddress(typed.address));
    if (draftChangesStored(stored?.contact ?? null, typed.alias))
      await store(draft());
    finishWalletSave(outcome);
  }
  async function requestTypedWallet(
    typed: AddressBookEntry,
  ): Promise<WalletSaveOutcome> {
    if (!networkAvailable()) return 'offline';
    if (connected(typed)) return 'saved';
    return (await requestWallet()) ? 'sent' : 'invite-only';
  }
  function finishWalletSave(outcome: WalletSaveOutcome): void {
    if (outcome === 'invite-only') {
      node<HTMLFormElement>('[data-book-form]')?.reset();
      if (editor) renderWalletPreview(editor);
      showInviteOnly(true);
      return;
    }
    resetEditor();
    // Already accepted: the editor stays open on its open-chat offer.
    if (outcome === 'sent' && requests.offered) return;
    node<HTMLDialogElement>('[data-contact-editor]')?.close();
    confirmed(savedMessage(outcome));
  }
  function savedMessage(
    outcome: Exclude<WalletSaveOutcome, 'invite-only'>,
  ): string {
    if (outcome === 'sent')
      return t(
        'Contact saved and request sent. You can chat once they accept.',
      );
    if (outcome === 'offline')
      return t(
        'Contact saved on this device. Connect to send the chat request.',
      );
    return sync.pending
      ? t(
          'Contact saved on this device. It will be sent when the connection returns.',
        )
      : t('Contact saved.');
  }
  async function discover(): Promise<void> {
    found = await contacts.discover(
      walletContactFromAddress(value('[data-book-address]')),
    );
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
      requests.approved(contact);
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
    if (editor) renderWalletPreview(editor);
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
    if (link) received = readInvitation(link, applicationOrigin());
    if (!received) throw new Error('Enter a valid invitation.');
    invitePeer = await contacts.invite(received);
    // Only the link is shown before accepting: no sender name or wallet.
    if (!invitePeer)
      failed(
        t(
          'Invitation unavailable, revoked or restricted by current privacy settings.',
        ),
      );
  }
  async function requestInvite(selected: Peer, token: string): Promise<void> {
    const expected = generation;
    requests.wait(selected.accountId);
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
    // The invitation is used up: clear its link so the form does not offer
    // the same request again.
    node<HTMLFormElement>('[data-contact-invite-form]')?.reset();
    await refresh();
    requests.approved(selected);
    confirmed(t('Invitation accepted. You can start the conversation.'));
  }
  async function sendInvite(): Promise<void> {
    await inspectInvite();
    if (invitePeer && received) await requestInvite(invitePeer, received.token);
  }
  /** Sends the signed request when the wallet accepts requests by address. */
  async function requestWallet(): Promise<boolean> {
    await contacts.refresh();
    await discover();
    if (!found) return false;
    const expected = generation;
    requests.wait(found.accountId);
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
    return true;
  }
  const actions: Record<string, () => Promise<void>> = {
    refresh,
    rotate,
    revoke: async () => {
      await invitations.revoke();
      confirmed(
        t('This invitation was revoked. Other invitations remain valid.'),
      );
    },
    copy: async () => {
      const ownLink = invitations.link;
      if (!ownLink) throw new Error('Create an invitation first.');
      await navigator.clipboard.writeText(ownLink);
      confirmed(t('Link copied. Share it manually with the recipient.'));
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
    loading.cancel();
    screenDiagnostics.clear();
    generation++;
    discovery.clear();
    contactSettings.clear();
    camera?.stop();
    node<HTMLDialogElement>('[data-contact-editor]')?.close();
    contacts.clear();
    directory.clear();
    invitations.clear();
    found = null;
    invitePeer = null;
    requests.clear();
    clearInputs();
    showInviteOnly(false);
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
    if (input) input.value = invitationLink(applicationOrigin(), received);
    openEditor('invite');
  }
  function readIncomingInvite(): void {
    try {
      const invite = incomingInvitation(location.hash, applicationOrigin());
      if (!invite) return;
      received = invite;
    } catch {
      received = null;
      failed(t('Invalid invitation. Check the full link.'));
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
        failed(message);
        render();
      },
      // The scanned link fills the field; accepting stays an explicit tap.
      decoded: (link) => {
        const input = node<HTMLInputElement>('[data-contact-received]');
        if (input) input.value = link;
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
    await loading.run(async (trace) => {
      await timedLoad(trace, 'vault', () => sync.openLocal());
      await timedLoad(trace, 'agenda', () => directory.load());
      return directory.entries.length;
    });
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
      ['[data-book-form]', saveWallet],
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
    if (mounted?.isConnected && contacts.session && networkAvailable())
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
      const changed = previousRevision !== contacts.state.revision;
      if (changed && !busy) noticeAccepted();
      const editing = node<HTMLDialogElement>('[data-contact-editor]')?.open;
      if (changed && !busy && (mounted?.isConnected || editing)) render();
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
      bindEditorFields(host, (message) => {
        failed(message);
        render();
      });
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
        screenDiagnostics.show(container, mode);
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
      screenDiagnostics.show(container, mode);
      void run(async () => {
        if (networkAvailable() && contacts.session) await refresh();
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
