import { t } from '../../shared/i18n/index.ts';
import { shortAddress } from '../appearance/index.ts';
import type { Daily, PeerState } from '../daily/index.ts';
import type { AccountSession } from '../../shared/account/index.ts';
import type { Peer, AddressBookEntry } from '../../shared/contacts/index.ts';
import { agendaContact } from '../contacts/index.ts';
import type { ContactDirectory, SavedContact } from '../contacts/index.ts';
import type { ConversationPeer } from './directory-controller.ts';
import {
  renderDirectory,
  filteredConversations,
  renderStatusStrip,
  statusAuthors as activeStatusAuthors,
} from './directory.ts';
import type {
  ConversationEntry,
  ConversationAction,
  ConversationFilter,
} from './directory.ts';
import type { ConversationMenu } from './directory-menu.ts';
import type { ConversationSearch } from './search.ts';
import { organizationActions } from './directory-actions.ts';
import { mountOfflineNotice } from '../ping/index.ts';
import { showGroupDirectoryPhoto } from '../groups/index.ts';
import { releaseConversationAvatars } from './directory-avatars.ts';
import type { startGroups } from '../groups/index.ts';
import type { ConversationPreview } from '../conversation-preview/index.ts';
type Groups = Pick<
  ReturnType<typeof startGroups>,
  'entries' | 'selected' | 'listLabel' | 'unread' | 'photo'
>;
interface DirectoryView {
  snapshot: () => {
    peers: readonly ConversationPeer[];
    selected: ConversationPeer | null;
    states: ReadonlyMap<string, PeerState>;
    statusAuthors: ReadonlySet<string>;
    session: AccountSession | null;
  };
  agenda: ContactDirectory;
  daily: Daily;
  groups: Groups;
  menu: ConversationMenu;
  searchPanel: ConversationSearch;
  node: <T extends HTMLElement>(selector: string) => T | null;
  host: () => HTMLElement | null;
  contactActions: (
    contact: AddressBookEntry,
    settingsId: string,
    mutePeer: string | null,
  ) => ConversationAction[];
  perform: (work: () => Promise<void>) => void;
  openPeer: (peer: ConversationPeer) => void;
  openContact: (contact: AddressBookEntry) => void;
  openGroup: (group: Groups['entries'][number]) => void;
  changed: (available: boolean) => void;
  unreadChanged?: (count: number) => void;
  presence: () => void;
  /** Covers row initials with the contact's private card photo. */
  peerPhoto?: (host: HTMLElement, peer: string, signal: AbortSignal) => void;
  previews?: ReadonlyMap<string, ConversationPreview>;
  previewsFailed?: () => boolean;
}
/** Projection and interaction only; no authority or persistence owned here. */
export class MessageDirectoryUi {
  private filter: ConversationFilter = 'all';
  private opening: string | null = null;
  private openingGeneration = 0;
  private readonly options: DirectoryView;
  constructor(options: DirectoryView) {
    this.options = options;
  }
  reset(): void {
    this.opening = null;
    this.openingGeneration++;
    this.filter = 'all';
    this.pause();
  }
  /** Acknowledge a queued tap without changing the crypto engine's recipient. */
  openingPeer(peer: string): () => void {
    const current = ++this.openingGeneration;
    this.opening = peer;
    this.renderContacts();
    return () => {
      if (current !== this.openingGeneration || this.opening === null) return;
      this.opening = null;
      this.renderContacts();
    };
  }
  pause(): void {
    const list = this.options.node('[data-message-contacts]');
    if (list) releaseConversationAvatars(list);
  }
  bind(): void {
    this.options
      .node('[data-chat-edit-contact]')
      ?.addEventListener('click', () => {
        const { selected } = this.options.snapshot();
        if (!selected || this.options.groups.selected) return;
        this.options
          .node('[data-chat-edit-contact]')
          ?.closest('details')
          ?.removeAttribute('open');
        this.options.openContact(
          this.options.agenda.find(selected)?.contact ??
            agendaContact(selected),
        );
      });
    const filters: readonly ConversationFilter[] = [
      'all',
      'unread',
      'favorites',
      'groups',
      'archived',
    ];
    for (const filter of filters)
      this.options
        .node(`[data-conversation-filter="${filter}"]`)
        ?.addEventListener('click', () => {
          this.filter = filter;
          this.renderContacts();
        });
  }
  private peerEntry(peer: ConversationPeer): ConversationEntry {
    const saved = this.options.agenda.find(peer),
      contact = saved?.contact ?? agendaContact(peer),
      favoriteId = this.options.agenda.id(peer);
    const settingsId = this.contactOrganizationId(saved, peer.accountId);
    const settings = this.options.daily.conversation(settingsId);
    return {
      id: peer.accountId,
      title: this.contactTitle(contact, peer),
      ...this.previewPresentation(peer, settingsId),
      kind: 'contact',
      seed: peer.address,
      ...(peer.localOnly || !this.options.peerPhoto
        ? {}
        : {
            avatar: (host: HTMLElement, signal: AbortSignal) =>
              this.options.peerPhoto?.(host, peer.accountId, signal),
          }),
      status: this.options.snapshot().statusAuthors.has(peer.accountId),
      searchText: t('{0} {1} {2}', [contact.alias, peer.name, peer.address]),
      selected: this.selectedPeer(peer.accountId),
      hidden: contact.removed,
      ...settings,
      favorite: this.options.daily.favorite(favoriteId),
      unread: this.options.snapshot().states.get(peer.accountId)?.unread ?? 0,
      actions: this.contactActions(
        contact,
        settingsId,
        peer.localOnly ? null : peer.accountId,
      ),
      open: () => {
        this.options.openPeer(peer);
      },
    };
  }
  private selectedPeer(peer: string): boolean {
    if (this.opening) return this.opening === peer;
    return (
      !this.options.groups.selected &&
      this.options.snapshot().selected?.accountId === peer
    );
  }
  private contactActions(
    contact: AddressBookEntry,
    settingsId: string,
    mutePeer: string | null,
  ): ConversationAction[] {
    return [
      {
        id: 'edit-contact',
        label: t('contacts.edit'),
        icon: 'edit',
        perform: () => this.options.openContact(contact),
      },
      ...this.options.contactActions(contact, settingsId, mutePeer),
    ];
  }
  private previewPresentation(
    peer: Peer,
    settingsId: string,
  ): Pick<ConversationEntry, 'detail' | 'preview'> {
    const preview = this.options.previews?.get(peer.accountId);
    return {
      detail: this.options.previewsFailed?.()
        ? t('preview.unavailable')
        : this.contactLabel(peer, settingsId),
      ...(preview ? { preview } : {}),
    };
  }
  contactOrganizationId(saved: SavedContact | undefined, peer: string): string {
    return saved && this.options.daily.hasOrganization(saved.entity)
      ? saved.entity
      : peer;
  }
  private contactTitle(contact: AddressBookEntry, peer: Peer): string {
    return contact.alias || peer.name || peer.address;
  }
  private savedEntry(saved: SavedContact): ConversationEntry {
    const { contact, entity } = saved,
      settings = this.options.daily.conversation(entity);
    return {
      id: entity,
      title: contact.alias || contact.address,
      detail: t('{0}{1} · saved in contacts', [
        settings.pinned ? '📌 ' : '',
        shortAddress(contact.address),
      ]),
      kind: 'contact',
      seed: contact.address,
      searchText: t('{0} {1}', [contact.alias, contact.address]),
      selected: false,
      hidden: contact.removed,
      ...settings,
      favorite: this.options.daily.favorite(entity),
      unread: 0,
      actions: this.contactActions(contact, entity, null),
      open: () => this.options.openContact(contact),
    };
  }
  private groupEntries(): ConversationEntry[] {
    return this.options.groups.entries.map((group) => {
      const id = group.state.groupId,
        settings = this.options.daily.conversation(id);
      return {
        id,
        title: group.title,
        detail: this.options.groups
          .listLabel(group)
          .replace(group.title + ' · ', ''),
        kind: 'group',
        avatarVersion: `${group.head}:${group.profileSequence ?? 0}`,
        avatar: (host, signal) =>
          showGroupDirectoryPhoto(
            host,
            group,
            () => this.options.groups.photo(group),
            signal,
          ),
        searchText: group.title,
        selected: this.options.groups.selected?.state.groupId === id,
        ...settings,
        favorite: this.options.daily.favorite(id),
        unread: this.options.groups.unread(id),
        actions: organizationActions({
          daily: this.options.daily,
          settingsId: id,
          favoriteId: id,
          mutePeer: group.localOnly ? null : id,
          perform: this.options.perform,
        }),
        menuNote: t(
          'Archiving mutes alerts. Unarchiving does not automatically restore alerts.',
        ),
        open: () => {
          this.options.openGroup(group);
        },
      };
    });
  }
  /** No conversations at all invites a first contact; an empty filter just finds nothing. */
  private emptyState(): { empty: string; emptyMood: 'wink' | 'puzzled' } {
    return this.filter === 'all'
      ? {
          empty: t('Add a contact or join a group to get started.'),
          emptyMood: 'wink',
        }
      : { empty: t('No conversations in this filter.'), emptyMood: 'puzzled' };
  }
  renderContacts(): void {
    const { peers, session, statusAuthors, selected } = this.options.snapshot();
    const list = this.options.node('[data-message-contacts]');
    if (!list) return;
    mountOfflineNotice(list);
    const panel = this.options.node('.chat-panel');
    if (panel)
      panel.dataset['empty'] = String(
        !selected && !this.options.groups.selected,
      );
    const entries: ConversationEntry[] = [
      ...peers.map((peer) => this.peerEntry(peer)),
      ...this.options.agenda.entries
        .filter(
          (saved) =>
            !peers.some(
              (peer) =>
                peer.ecosystem === saved.contact.ecosystem &&
                peer.address === saved.contact.address,
            ),
        )
        .map((saved) => this.savedEntry(saved)),
      ...this.groupEntries(),
    ];
    const strip = this.options.node('[data-status-strip]');
    if (strip)
      renderStatusStrip(strip, {
        ownActive:
          session && statusAuthors.has(session.accountId)
            ? session.accountId
            : null,
        authors: activeStatusAuthors(entries),
      });
    const sorted = filteredConversations(entries, this.filter);
    this.options.unreadChanged?.(
      entries.reduce(
        (sum, entry) => sum + (entry.hidden ? 0 : (entry.unread ?? 0)),
        0,
      ),
    );
    renderDirectory(list, sorted, {
      menu: this.options.menu,
      ...this.emptyState(),
    });
    this.options
      .host()
      ?.querySelectorAll<HTMLButtonElement>('[data-conversation-filter]')
      .forEach((button) =>
        button.setAttribute(
          'aria-pressed',
          String(button.dataset['conversationFilter'] === this.filter),
        ),
      );
    const tools = this.options.node('[data-group-tools]');
    if (tools) tools.hidden = this.filter !== 'groups';
    this.options.changed(entries.length > 0);
    this.options.searchPanel.update(entries);
    this.options.presence();
  }
  private contactLabel(peer: Peer, settingsId: string): string {
    const state = this.options.snapshot().states.get(peer.accountId),
      settings = this.options.daily.conversation(settingsId);
    const conflict = this.options.daily.organizationConflict(settingsId)
      ? t(' · conflicting organization')
      : '';
    const address = shortAddress(peer.address);
    return `${settings.pinned ? '📌 ' : ''}${address}${state && state.mutedUntil > Date.now() ? t(' · muted') : ''}${conflict}`;
  }
}
