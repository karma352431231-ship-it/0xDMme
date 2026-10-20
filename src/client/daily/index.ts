import { groupMediaQuota } from '../../shared/group-quota/index.ts';
import { object, base64, keys } from '../../shared/account/index.ts';
import {
  conversationSettings,
  mergeConversationSettings,
  pushRegistration,
  genericNotification,
  pushPreferences,
} from '../../shared/daily/index.ts';
import type {
  DailyPreferences,
  ConversationSettings,
  PushPreferences,
} from '../../shared/daily/index.ts';
import type { AccountSession } from '../../shared/account/index.ts';
import { integer } from '../../shared/vault/index.ts';
import type { VaultAccess } from '../vault-authority/index.ts';
import type { VaultSync } from '../vault-sync/index.ts';
import { messageApi } from '../message-api/index.ts';
import { announcePreference } from '../preference-events/index.ts';
import { readConversationReceipts } from './receipts.ts';
import type { ReceiptWindow } from './receipts.ts';
type OrganizationSync = Pick<
  VaultSync,
  'complete' | 'currentHeads' | 'isRemoved' | 'open' | 'refresh' | 'save'
>;

export interface PeerState {
  revision: number;
  mutedUntil: number;
  unread: number;
  online: boolean;
  lastSeen: string | null;
  cleanup?: { dueAt: number; bytes: number };
}
export class Daily {
  private readonly access: VaultAccess;
  private readonly sync: OrganizationSync;
  private session: AccountSession | null = null;
  private generation = 0;
  private configured = '';
  private settings = new Map<string, ConversationSettings>();
  private conflicts = new Set<string>();
  private groups = new Map<string, string>();
  private favorites = new Map<string, boolean>();
  setGroups(groups: { id: string; head: string }[]): void {
    this.groups = new Map(groups.map((g) => [g.id, g.head]));
  }
  constructor(access: VaultAccess, sync: OrganizationSync) {
    this.access = access;
    this.sync = sync;
  }
  private assertGeneration(generation: number): void {
    if (generation !== this.generation) throw new Error('Session changed.');
  }
  setSession(session: AccountSession | null): void {
    if (
      this.session?.accountId !== session?.accountId ||
      this.session?.deviceId !== session?.deviceId ||
      this.session?.csrf !== session?.csrf
    ) {
      this.generation++;
      this.configured = '';
      this.groups.clear();
      this.settings.clear();
      this.conflicts.clear();
      this.favorites.clear();
    }
    this.session = session;
  }
  async api(
    operation: string,
    payload: Record<string, unknown> = {},
  ): Promise<unknown> {
    const generation = this.generation;
    const guard = () => {
      if (generation !== this.generation) throw new Error('Session changed.');
    };
    return this.access.withVault(false, (a) =>
      messageApi(a, operation, payload, guard),
    );
  }
  async configure(preferences: DailyPreferences | null): Promise<void> {
    if (!preferences || !this.session) return;
    const chosen = {
      online: preferences.online,
      lastSeen: false,
      readReceipts: preferences.readReceipts,
    };
    const identity = JSON.stringify([this.session.profileRevision, chosen]);
    if (this.configured === identity) return;
    await this.api('daily-configure', {
      revision: this.session.profileRevision,
      preferences: chosen,
    });
    this.configured = identity;
  }
  async heartbeat(active: boolean): Promise<void> {
    if (this.session && navigator.onLine)
      await this.api('daily-heartbeat', { active });
  }
  async state(peer: string): Promise<PeerState> {
    const head = this.groups.get(peer);
    if (head)
      return parseState({
        ...object(await this.api('group-daily-state', { groupId: peer, head })),
        online: false,
        lastSeen: null,
      });
    return parseState(await this.api('daily-state', { peer }));
  }
  async states(peers: string[]): Promise<Map<string, PeerState>> {
    const states = new Map<string, PeerState>();
    for (let offset = 0; offset < peers.length; offset += 16) {
      const raw = await this.api('daily-states', {
        peers: peers.slice(offset, offset + 16),
      });
      if (!Array.isArray(raw) || raw.length > 16)
        throw new Error('Invalid states.');
      for (const value of raw)
        states.set(String(object(value)['peer']), parseState(value));
    }
    return states;
  }
  async groupStates(): Promise<Map<string, PeerState>> {
    const states = new Map<string, PeerState>(),
      groups = [...this.groups].map(([groupId, head]) => ({ groupId, head }));
    for (let offset = 0; offset < groups.length; offset += 16) {
      const raw = await this.api('group-daily-states', {
        groups: groups.slice(offset, offset + 16),
      });
      if (!Array.isArray(raw) || raw.length > 16)
        throw new Error('Invalid group states.');
      for (const value of raw) {
        const data = object(value);
        states.set(
          String(data['peer']),
          parseState({ ...data, online: false, lastSeen: null }),
        );
      }
    }
    return states;
  }
  async mute(
    peer: string,
    duration: number,
    options: { settingsId?: string } = {},
  ): Promise<void> {
    const generation = this.generation,
      settingsId = options.settingsId ?? peer;
    await this.refreshOrganization(settingsId);
    this.assertGeneration(generation);
    if (
      this.conversation(settingsId).archived &&
      duration !== Number.MAX_SAFE_INTEGER
    )
      throw new Error(
        'Unarchive the conversation before changing or resuming alerts.',
      );
    await this.applyMute(peer, duration);
  }
  async keepArchivedSilent(
    peer: string,
    settingsId: string,
    state: PeerState,
  ): Promise<PeerState> {
    if (
      !this.conversation(settingsId).archived ||
      state.mutedUntil === Number.MAX_SAFE_INTEGER
    )
      return state;
    await this.mute(peer, Number.MAX_SAFE_INTEGER, { settingsId });
    return this.state(peer);
  }
  private async applyMute(peer: string, duration: number): Promise<void> {
    const state = await this.state(peer);
    const mutedUntil =
      duration === Number.MAX_SAFE_INTEGER
        ? duration
        : duration
          ? Date.now() + duration
          : 0;
    const head = this.groups.get(peer);
    await this.api(head ? 'group-daily-mute' : 'daily-mute', {
      ...(head ? { groupId: peer, head } : { peer }),
      revision: state.revision,
      mutedUntil,
    });
    const registration = await navigator.serviceWorker?.getRegistration('/');
    for (const notification of (await registration?.getNotifications()) ?? [])
      notification.close();
  }
  async readConversation(input: ReceiptWindow): Promise<Set<string> | null> {
    if (!input.current()) return null;
    if (!input.incoming.length && !input.outgoing.length) return new Set();
    const generation = this.generation;
    return this.access.withVault(
      false,
      (authority) =>
        readConversationReceipts({
          ...input,
          api: (operation, payload) =>
            messageApi(authority, operation, payload, () =>
              this.assertGeneration(generation),
            ),
        }),
      { priority: 'interactive' },
    );
  }
  async loadSettings(peers: readonly string[]): Promise<void> {
    if (!this.sync.complete)
      throw new Error(
        'Sync the vault before opening conversation preferences.',
      );
    const generation = this.generation;
    const settings = new Map<string, ConversationSettings>(),
      conflicts = new Set<string>(),
      favorites = new Map<string, boolean>();
    for (const group of this.sync.currentHeads().values()) {
      const entries = group.filter(
        (e) =>
          e.change.kind === 'settings' &&
          e.change.label === 'Preferências da conversa' &&
          peers.includes(e.change.entity) &&
          !this.sync.isRemoved(e.commit.id),
      );
      const favoriteHeads = group.filter(
        (e) =>
          e.change.kind === 'settings' &&
          e.change.label === 'Conversa favorita' &&
          peers.includes(e.change.entity) &&
          !this.sync.isRemoved(e.commit.id),
      );
      if (favoriteHeads.length > 16 || entries.length > 16)
        throw new Error(
          'Too many preference versions. Resolve conflicts before continuing.',
        );
      if (favoriteHeads[0])
        favorites.set(
          favoriteHeads[0].change.entity,
          await this.readFavorites(favoriteHeads),
        );
      const e = entries[0];
      if (!e) continue;
      if (entries.length > 1) conflicts.add(e.change.entity);
      const values = [];
      for (const entry of entries)
        values.push(
          conversationSettings(
            JSON.parse(await this.sync.open(entry.commit.id)) as unknown,
          ),
        );
      settings.set(e.change.entity, mergeConversationSettings(values));
    }
    this.assertGeneration(generation);
    this.settings = settings;
    this.conflicts = conflicts;
    this.favorites = favorites;
  }
  private async readFavorites(
    heads: readonly import('../vault-sync/index.ts').VaultEntry[],
  ): Promise<boolean> {
    let favorite = false;
    for (const head of heads) {
      const value = favoriteValue(
        JSON.parse(await this.sync.open(head.commit.id)) as unknown,
      );
      favorite = value || favorite;
    }
    return favorite;
  }
  favorite(id: string): boolean {
    return this.favorites.get(id) ?? false;
  }
  hasOrganization(id: string): boolean {
    return this.settings.has(id);
  }
  async setFavorite(id: string, favorite: boolean): Promise<void> {
    const generation = this.generation;
    await this.refreshOrganization(id);
    const parents = [...this.sync.currentHeads().values()]
      .flat()
      .filter(
        (e) =>
          e.change.kind === 'settings' &&
          e.change.entity === id &&
          e.change.label === 'Conversa favorita' &&
          !this.sync.isRemoved(e.commit.id),
      )
      .map((e) => e.commit.id);
    if (parents.length > 16)
      throw new Error("Resolve this favorite's versions before continuing.");
    this.assertGeneration(generation);
    await this.sync.save({
      change: {
        version: 1,
        entity: id,
        kind: 'settings',
        parents,
        label: 'Conversa favorita',
      },
      value: JSON.stringify({ favorite }),
    });
    this.assertGeneration(generation);
    this.favorites.set(id, favorite);
  }
  organizationConflict(peer: string): boolean {
    return this.conflicts.has(peer);
  }
  conversation(peer: string): ConversationSettings {
    return (
      this.settings.get(peer) ?? {
        mutedUntil: 0,
        archived: false,
        pinned: false,
      }
    );
  }
  async organize(
    peer: string,
    patch: { archived?: boolean; pinned?: boolean },
    options: { mutePeer?: string | null } = {},
  ): Promise<void> {
    const generation = this.generation;
    await this.refreshOrganization(peer);
    const parents = [...this.sync.currentHeads().values()]
      .flat()
      .filter(
        (e) =>
          e.change.kind === 'settings' &&
          e.change.entity === peer &&
          e.change.label === 'Preferências da conversa',
      )
      .map((e) => e.commit.id);
    const value = { ...this.conversation(peer), ...patch };
    const mutePeer = options.mutePeer === undefined ? peer : options.mutePeer;
    this.assertGeneration(generation);
    if (patch.archived && mutePeer)
      await this.applyMute(mutePeer, Number.MAX_SAFE_INTEGER);
    this.assertGeneration(generation);
    try {
      await this.sync.save({
        change: {
          version: 1,
          entity: peer,
          kind: 'settings',
          parents,
          label: 'Preferências da conversa',
        },
        value: JSON.stringify(value),
      });
    } catch (error: unknown) {
      if (patch.archived && mutePeer)
        throw new Error(
          'Alerts were muted, but archiving was not saved. Try again.',
          { cause: error },
        );
      throw error;
    }
    this.assertGeneration(generation);
    this.settings.set(peer, value);
  }
  private async refreshOrganization(peer: string): Promise<void> {
    await this.sync.refresh();
    const visible = [
      ...new Set([...this.settings.keys(), ...this.favorites.keys(), peer]),
    ];
    await this.loadSettings(visible);
    if ((this.sync.currentHeads().get(peer)?.length ?? 0) > 16)
      throw new Error(
        'Too many simultaneous changes in this conversation. Sync, then try again.',
      );
  }
  async enablePush(): Promise<void> {
    if (
      !('Notification' in globalThis) ||
      !('PushManager' in globalThis) ||
      !('serviceWorker' in navigator)
    )
      throw new Error(
        'This browser does not support Web Push. On iPhone/iPad, add the app to the home screen and open its icon.',
      );
    const permission = await Notification.requestPermission();
    if (permission !== 'granted')
      throw new Error(
        'Notification permission not granted. Change it in browser settings to try again.',
      );
    const config = object(await this.api('daily-config'));
    if (typeof config['publicKey'] !== 'string')
      throw new Error(
        'Push delivery has not been configured in this environment yet.',
      );
    const registration = await navigator.serviceWorker.getRegistration('/');
    if (!registration?.active)
      throw new Error(
        'Wait for the offline app installation to finish, then try again.',
      );
    const subscription =
      (await registration.pushManager.getSubscription()) ??
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64(
          config['publicKey'].replaceAll('-', '+').replaceAll('_', '/') + '=',
          65,
        ),
      }));
    const raw = subscription.toJSON();
    const value = pushRegistration({ endpoint: raw.endpoint, keys: raw.keys });
    await this.api('daily-subscribe', { subscription: value });
    announcePreference({ pushEnabled: true });
  }
  /** Browser-side state only: permission granted and a subscription present. */
  async pushSubscribed(): Promise<boolean> {
    if (
      !('Notification' in globalThis) ||
      Notification.permission !== 'granted' ||
      !('serviceWorker' in navigator)
    )
      return false;
    const registration = await navigator.serviceWorker.getRegistration('/');
    return Boolean(await registration?.pushManager.getSubscription());
  }
  async pushPreferences(): Promise<PushPreferences> {
    return pushPreferences(await this.api('daily-push-state'));
  }
  async configurePush(preferences: PushPreferences): Promise<void> {
    await this.api('daily-push-configure', { preferences });
    announcePreference({ push: preferences });
    const registration = await navigator.serviceWorker?.getRegistration('/');
    for (const notification of (await registration?.getNotifications()) ?? [])
      notification.close();
  }
  async disablePush(): Promise<void> {
    await this.api('daily-subscribe', { subscription: null });
    announcePreference({ pushEnabled: false });
    const registration = await navigator.serviceWorker.getRegistration('/');
    await (await registration?.pushManager.getSubscription())?.unsubscribe();
  }
}
export { genericNotification };
function favoriteValue(input: unknown): boolean {
  const value = object(input);
  keys(value, ['favorite']);
  if (typeof value['favorite'] !== 'boolean')
    throw new Error('Invalid favorite.');
  return value['favorite'];
}
function parseState(value: unknown): PeerState {
  const d = object(value);
  if (
    typeof d['online'] !== 'boolean' ||
    (d['lastSeen'] !== null && typeof d['lastSeen'] !== 'string')
  )
    throw new Error('Invalid presence.');
  return {
    revision: integer(d['revision'], 2147483647),
    mutedUntil: integer(Number(d['mutedUntil']), Number.MAX_SAFE_INTEGER),
    unread: integer(d['unread'], 2147483647),
    online: d['online'],
    lastSeen: null,
    ...cleanupState(d),
  };
}
function cleanupState(d: Record<string, unknown>): Pick<PeerState, 'cleanup'> {
  if (d['cleanupDueAt'] === undefined || d['cleanupDueAt'] === null) return {};
  return {
    cleanup: {
      dueAt: integer(Number(d['cleanupDueAt']), Number.MAX_SAFE_INTEGER),
      bytes: integer(d['cleanupBytes'], groupMediaQuota),
    },
  };
}
