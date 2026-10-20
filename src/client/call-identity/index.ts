import { object } from '../../shared/account/index.ts';
import { fingerprint } from '../../shared/devices/index.ts';
import type { DirectoryEvent } from '../../shared/devices/index.ts';
import { integer } from '../../shared/vault/index.ts';
import { messageApi } from '../message-api/index.ts';
import { PeerIdentity, peerHistory } from '../peer-identity/index.ts';
import type { VaultAccess, VaultAuthority } from '../vault-authority/index.ts';
import { readPage } from '../vault-sync/index.ts';
import type { VaultSync } from '../vault-sync/index.ts';

type IdentitySync = Pick<
  VaultSync,
  | 'refresh'
  | 'complete'
  | 'state'
  | 'removalCursor'
  | 'currentHeads'
  | 'openMany'
  | 'save'
  | 'isRemoved'
>;
/** Loaded pins are reused only after fresh vault AND removal reads agree. */
export class CallIdentity {
  private readonly identities: PeerIdentity;
  private checkpoint: string | null = null;
  private generation = 0;
  private enhanced = true;
  private loading: { generation: number; work: Promise<void> } | null = null;
  private readonly access: VaultAccess;
  private readonly sync: IdentitySync;
  constructor(access: VaultAccess, sync: IdentitySync) {
    this.access = access;
    this.sync = sync;
    this.identities = new PeerIdentity(sync);
  }
  /** Only the fully hydrated local state can seed a bounded initial setup. */
  get current(): string | null {
    return this.checkpoint === this.stamp() ? this.checkpoint : null;
  }
  prime(): Promise<void> {
    return this.load(this.generation);
  }
  enable(enabled: boolean): void {
    if (enabled === this.enhanced) return;
    this.enhanced = enabled;
    this.checkpoint = null;
  }
  clear(): void {
    this.generation++;
    this.checkpoint = null;
    this.identities.clear();
  }
  private stamp(): string | null {
    if (!this.sync.complete) return null;
    return JSON.stringify([
      this.sync.state.sequence,
      this.sync.state.head,
      this.sync.removalCursor,
    ]);
  }
  private guard(g: number): void {
    if (g !== this.generation) throw new Error('Call identity changed.');
  }
  async withPeer<T>(
    peer: string,
    work: (a: VaultAuthority, peer: DirectoryEvent) => Promise<T>,
  ): Promise<T> {
    const g = this.generation;
    if (!this.enhanced) return this.legacy(peer, work, g);
    for (let attempt = 0; attempt < 2; attempt++) {
      await this.load(g);
      const result = await this.access.withVault(
        false,
        async (a) => {
          const stamp = this.stamp();
          const raw = object(
            await messageApi(
              a,
              'call-context',
              {
                peer,
                vault: this.sync.state.sequence,
                removals: this.sync.removalCursor,
              },
              () => this.guard(g),
            ),
          );
          if (
            !stamp ||
            stamp !== this.checkpoint ||
            stamp !== this.stamp() ||
            !this.unchanged(raw)
          )
            return null;
          const events = await this.directory(a, peer, raw['peer'], g);
          this.guard(g);
          const last = events.at(-1);
          if (!last) throw new Error('Contact identity missing.');
          const value = await work(a, last);
          this.guard(g);
          if (stamp !== this.stamp())
            throw new Error('Vault changed during the call.');
          return { value, events, stamp };
        },
        { priority: 'interactive' },
      );
      this.guard(g);
      if (!result) {
        this.checkpoint = null;
        continue;
      }
      await this.identities.remember(peer, result.events);
      await this.identities.save(() => this.guard(g));
      this.guard(g);
      // save() already pulled/verified its confirmed vault head. Hydrate that
      // state now; the next operation still performs fresh vault/removal reads.
      await this.identities.loadCurrent();
      this.guard(g);
      this.checkpoint = this.stamp();
      return result.value;
    }
    throw new Error('Identities changed during the call. Try again.');
  }
  private async legacy<T>(
    peer: string,
    work: (a: VaultAuthority, peer: DirectoryEvent) => Promise<T>,
    g: number,
  ): Promise<T> {
    await this.identities.load();
    this.guard(g);
    const result = await this.access.withVault(
      false,
      async (a) => {
        const events = await peerHistory(
          (op, d) => messageApi(a, op, d, () => this.guard(g)),
          peer,
          null,
          this.identities.get(peer),
        );
        const last = events.at(-1);
        if (!last) throw new Error('Contact identity missing.');
        await this.identities.remember(peer, events);
        return work(a, last);
      },
      { priority: 'interactive' },
    );
    await this.identities.save(() => this.guard(g));
    this.guard(g);
    return result;
  }
  private async load(g: number): Promise<void> {
    if (this.checkpoint && this.checkpoint === this.stamp()) return;
    if (this.loading?.generation === g) return this.loading.work;
    const work = this.identities
      .load()
      .then(() => {
        this.guard(g);
        this.checkpoint = this.stamp();
      })
      .finally(() => {
        if (this.loading?.work === work) this.loading = null;
      });
    this.loading = { generation: g, work };
    await work;
  }
  private unchanged(raw: Record<string, unknown>): boolean {
    const vault = readPage(raw['vault']),
      removed = object(raw['removals']);
    if (!Array.isArray(removed['items']) || removed['items'].length > 16)
      throw new Error('Invalid removals page.');
    return (
      vault.sequence === this.sync.state.sequence &&
      vault.head === this.sync.state.head &&
      vault.commits.length === 0 &&
      removed['items'].length === 0 &&
      removed['next'] === null
    );
  }
  private async directory(
    a: VaultAuthority,
    peer: string,
    input: unknown,
    g: number,
  ): Promise<DirectoryEvent[]> {
    const data = object(input),
      events = data['events'];
    const revision = integer(data['revision'], 128),
      head = fingerprint(data['head']);
    if (
      !Array.isArray(events) ||
      !events.length ||
      events.length > 8 ||
      events.length > revision
    )
      throw new Error('Invalid directory page.');
    if (events.length !== revision)
      return peerHistory(
        (op, d) => messageApi(a, op, d, () => this.guard(g)),
        peer,
        null,
        this.identities.get(peer),
      );
    return this.identities.verify({
      account: peer,
      events,
      expected: head,
      current: true,
    });
  }
}
