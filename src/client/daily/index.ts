import { object, base64 } from '../../shared/account/index.ts';
import {
  conversationSettings,
  pushRegistration,
  genericNotification,
} from '../../shared/daily/index.ts';
import type {
  DailyPreferences,
  ConversationSettings,
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
}
export class Daily {
  private readonly access: VaultAccess;
  private readonly sync: OrganizationSync;
  private session: AccountSession | null = null;
  private generation = 0;
  private configured = '';
  private settings = new Map<string, ConversationSettings>();
  private conflicts = new Set<string>();
  constructor(access: VaultAccess, sync: OrganizationSync) {
    this.access = access;
    this.sync = sync;
  }
  setSession(session: AccountSession | null): void {
    if (
      this.session?.accountId !== session?.accountId ||
      this.session?.deviceId !== session?.deviceId ||
      this.session?.csrf !== session?.csrf
    ) {
      this.generation++;
      this.configured = '';
      this.settings.clear();
      this.conflicts.clear();
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
    return parseState(await this.api('daily-state', { peer }));
  }
  async states(peers: string[]): Promise<Map<string, PeerState>> {
    const raw = await this.api('daily-states', { peers });
    if (!Array.isArray(raw) || raw.length > 16)
      throw new Error('Estados inválidos.');
    return new Map(
      raw.map((value) => [String(object(value)['peer']), parseState(value)]),
    );
  }
  async mute(peer: string, duration: number): Promise<void> {
    await this.refreshOrganization(peer);
    if (
      this.conversation(peer).archived &&
      duration !== Number.MAX_SAFE_INTEGER
    )
      throw new Error(
        'Desarquive a conversa antes de alterar ou retomar os alertas.',
      );
    await this.applyMute(peer, duration);
  }
  private async applyMute(peer: string, duration: number): Promise<void> {
    const state = await this.state(peer);
    const mutedUntil =
      duration === Number.MAX_SAFE_INTEGER
        ? duration
        : duration
          ? Date.now() + duration
          : 0;
    await this.api('daily-mute', {
      peer,
      revision: state.revision,
      mutedUntil,
    });
    const registration = await navigator.serviceWorker?.getRegistration('/');
    for (const notification of (await registration?.getNotifications({
      tag: '0xdmme-activity',
    })) ?? [])
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
    this.settings.clear();
    this.conflicts.clear();
    for (const group of this.sync.currentHeads().values()) {
      const entries = group.filter(
        (e) =>
          e.change.kind === 'settings' &&
          e.change.label === 'Preferências da conversa' &&
          peers.includes(e.change.entity) &&
          !this.sync.isRemoved(e.commit.id),
      );
      const e = entries[0];
      if (!e) continue;
      if (entries.length > 1) {
        this.conflicts.add(e.change.entity);
        continue;
      }
      this.settings.set(
        e.change.entity,
        conversationSettings(
          JSON.parse(await this.sync.open(e.commit.id)) as unknown,
        ),
      );
    }
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
  ): Promise<void> {
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
    if (patch.archived) await this.applyMute(peer, Number.MAX_SAFE_INTEGER);
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
      if (patch.archived)
        throw new Error(
          'Alertas silenciados, mas o arquivamento não foi salvo. Tente novamente.',
          { cause: error },
        );
      throw error;
    }
    this.settings.set(peer, value);
  }
  private async refreshOrganization(peer: string): Promise<void> {
    await this.sync.refresh();
    const visible = [...new Set([...this.settings.keys(), peer])].slice(-16);
    await this.loadSettings(visible);
    if (this.organizationConflict(peer))
      throw new Error(
        'Preferências da conversa em conflito. Escolha uma versão no Cofre antes de organizar.',
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
  async disablePush(): Promise<void> {
    await this.api('daily-subscribe', { subscription: null });
    const registration = await navigator.serviceWorker.getRegistration('/');
    await (await registration?.pushManager.getSubscription())?.unsubscribe();
  }
}
export { genericNotification };
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
  };
}
