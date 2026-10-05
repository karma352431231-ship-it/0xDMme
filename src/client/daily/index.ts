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
    if (generation !== this.generation) throw new Error('Sessão alterada.');
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
      if (generation !== this.generation) throw new Error('Sessão alterada.');
    };
    return this.access.withVault(false, (a) =>
      messageApi(a, operation, payload, guard),
    );
  }
  async configure(preferences: DailyPreferences | null): Promise<void> {
    if (!preferences || !this.session) return;
    const chosen = {
      online: preferences.online,
      lastSeen: preferences.lastSeen,
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
        throw new Error('Estados inválidos.');
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
        throw new Error('Estados de grupo inválidos.');
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
        'Desarquive a conversa antes de alterar ou retomar os alertas.',
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
  async read(peer: string, ids: string[]): Promise<void> {
    await this.api('daily-read', { peer, ids });
  }
  async receipts(ids: string[]): Promise<Set<string>> {
    const raw = await this.api('daily-receipts', { ids });
    if (!Array.isArray(raw) || raw.length > 16)
      throw new Error('Confirmações inválidas.');
    return new Set(raw.map((value) => String(value)));
  }
  async loadSettings(peers: readonly string[]): Promise<void> {
    if (!this.sync.complete)
      throw new Error(
        'Sincronize o cofre antes de abrir preferências de conversa.',
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
          'Muitas versões de preferências. Resolva os conflitos antes de continuar.',
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
      throw new Error('Resolva as versões deste favorito antes de continuar.');
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
          'Alertas silenciados, mas o arquivamento não foi salvo. Tente novamente.',
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
        'Muitas alterações simultâneas nesta conversa. Tente novamente após sincronizar.',
      );
  }
  async enablePush(): Promise<void> {
    if (
      !('Notification' in globalThis) ||
      !('PushManager' in globalThis) ||
      !('serviceWorker' in navigator)
    )
      throw new Error(
        'Este navegador não oferece Web Push. No iPhone/iPad, adicione à tela inicial e abra pelo ícone.',
      );
    const permission = await Notification.requestPermission();
    if (permission !== 'granted')
      throw new Error(
        'Permissão de notificação não concedida. Altere-a nas configurações do navegador para tentar novamente.',
      );
    const config = object(await this.api('daily-config'));
    if (typeof config['publicKey'] !== 'string')
      throw new Error('O envio push ainda não foi configurado neste ambiente.');
    const registration = await navigator.serviceWorker.getRegistration('/');
    if (!registration?.active)
      throw new Error(
        'Aguarde a instalação do aplicativo offline e tente novamente.',
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
  }
  async pushPreferences(): Promise<PushPreferences> {
    return pushPreferences(await this.api('daily-push-state'));
  }
  async configurePush(preferences: PushPreferences): Promise<void> {
    await this.api('daily-push-configure', { preferences });
    const registration = await navigator.serviceWorker?.getRegistration('/');
    for (const notification of (await registration?.getNotifications()) ?? [])
      notification.close();
  }
  async disablePush(): Promise<void> {
    await this.api('daily-subscribe', { subscription: null });
    const registration = await navigator.serviceWorker.getRegistration('/');
    await (await registration?.pushManager.getSubscription())?.unsubscribe();
  }
}
export { genericNotification };
function favoriteValue(input: unknown): boolean {
  const value = object(input);
  keys(value, ['favorite']);
  if (typeof value['favorite'] !== 'boolean')
    throw new Error('Favorito inválido.');
  return value['favorite'];
}
function parseState(value: unknown): PeerState {
  const d = object(value);
  if (
    typeof d['online'] !== 'boolean' ||
    (d['lastSeen'] !== null && typeof d['lastSeen'] !== 'string')
  )
    throw new Error('Presença inválida.');
  return {
    revision: integer(d['revision'], 2147483647),
    mutedUntil: integer(Number(d['mutedUntil']), Number.MAX_SAFE_INTEGER),
    unread: integer(d['unread'], 2147483647),
    online: d['online'],
    lastSeen: d['lastSeen'],
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
