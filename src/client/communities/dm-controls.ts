import { t } from '../../shared/i18n/index.ts';
import type { SocialRelation } from '../../shared/social-dm/index.ts';
import type { AccountSession } from '../../shared/account/index.ts';
import type { VaultAccess } from '../vault-authority/index.ts';
import type { VaultSync } from '../vault-sync/index.ts';
import { Daily } from '../daily/index.ts';
import type { ConversationAction } from '../conversation-menu/index.ts';

interface ControlPorts {
  access: VaultAccess;
  sync: VaultSync;
  block: (peer: string, blocked: boolean, revision: number) => Promise<void>;
  state: (peer: string) => Promise<SocialRelation | null>;
  run: (work: () => Promise<void>) => Promise<void>;
  changed: () => Promise<void>;
  blockPublic?: (peer: string) => Promise<void>;
}
/** Public block authority and encrypted public-DM preferences remain separate from wallet contacts. */
export class DmControls {
  private readonly preferences: Daily;
  private readonly ports: ControlPorts;
  constructor(ports: ControlPorts) {
    this.ports = ports;
    this.preferences = new Daily(ports.access, ports.sync);
  }
  setSession(session: AccountSession | null): void {
    this.preferences.setSession(session);
  }
  private key(peer: string): string {
    return `public-dm:${peer}`;
  }
  async load(peers: readonly string[]): Promise<void> {
    await this.preferences.loadSettings(peers.map((peer) => this.key(peer)));
  }
  muted(peer: string): boolean {
    return (
      this.preferences.conversation(this.key(peer)).mutedUntil > Date.now()
    );
  }
  async audible(peers: readonly string[]): Promise<string[]> {
    await this.load(peers);
    return peers.filter((peer) => !this.muted(peer));
  }
  actions(relation: SocialRelation): ConversationAction[] {
    const peer = relation.peer.id;
    const action = (
      id: string,
      label: string,
      work: () => Promise<void>,
    ): ConversationAction => ({
      id,
      label,
      icon:
        id === 'mute'
          ? this.muted(peer)
            ? 'unmute'
            : 'mute'
          : id === 'dm-block' && relation.blocked
            ? 'unblock'
            : 'block',
      perform: () => {
        void this.ports.run(async () => {
          await work();
          await this.ports.changed();
        });
      },
    });
    return [
      action(
        'dm-block',
        relation.blocked
          ? t('Allow handle messages')
          : t('Prevent handle messages'),
        async () => {
          const current = await this.ports.state(peer);
          await this.ports.block(
            peer,
            !relation.blocked,
            current?.blockRevision ?? 0,
          );
        },
      ),
      ...(this.ports.blockPublic
        ? [
            action('public-block', t('Block user and hide posts'), () =>
              this.blockPublic(peer),
            ),
          ]
        : []),
      action(
        'mute',
        this.muted(peer) ? t('Unmute conversation') : t('Mute conversation'),
        async () => {
          await this.preferences.organize(
            this.key(peer),
            {
              mutedUntil: this.muted(peer) ? 0 : Number.MAX_SAFE_INTEGER,
            },
            { mutePeer: null },
          );
        },
      ),
    ];
  }
  private async blockPublic(peer: string): Promise<void> {
    const current = await this.ports.state(peer);
    if (!current?.blocked)
      await this.ports.block(peer, true, current?.blockRevision ?? 0);
    try {
      await this.ports.blockPublic?.(peer);
    } catch (error: unknown) {
      throw new Error(
        'Messages are blocked, but the public profile could not be blocked. Try again.',
        { cause: error },
      );
    }
  }
}
