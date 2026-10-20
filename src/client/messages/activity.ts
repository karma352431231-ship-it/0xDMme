import type { Daily, PeerState } from '../daily/index.ts';

interface ActivityPorts {
  generation: () => number;
  current: (generation: number) => boolean;
  peers: () => readonly { id: string; settings: string; localOnly?: boolean }[];
  daily: Pick<Daily, 'states' | 'keepArchivedSilent'>;
  previous: () => ReadonlyMap<string, PeerState>;
  publish: (states: Map<string, PeerState>) => void;
  alert: () => void;
}

/** Unread counts and sound share one authorized projection. They never wait
 * for push preferences, presence, profile maintenance or directory previews. */
export class ConversationActivity {
  private readonly ports: ActivityPorts;
  private active: Promise<void> | null = null;
  private pending = false;
  constructor(ports: ActivityPorts) {
    this.ports = ports;
  }
  refresh(): Promise<void> {
    this.pending = true;
    this.active ??= this.drain();
    return this.active;
  }
  private async drain(): Promise<void> {
    try {
      while (this.pending) {
        this.pending = false;
        await this.project();
      }
    } finally {
      this.active = null;
    }
  }
  private async project(): Promise<void> {
    const generation = this.ports.generation(),
      peers = this.ports.peers();
    const next = await this.ports.daily.states(peers.map((peer) => peer.id));
    if (!this.ports.current(generation)) return;
    for (const peer of peers) {
      const state = next.get(peer.id);
      if (!state || peer.localOnly) continue;
      next.set(
        peer.id,
        await this.ports.daily.keepArchivedSilent(
          peer.id,
          peer.settings,
          state,
        ),
      );
      if (!this.ports.current(generation)) return;
    }
    const previous = this.ports.previous();
    this.ports.publish(next);
    for (const [id, state] of next)
      if (
        previous.has(id) &&
        state.unread > previous.get(id)!.unread &&
        state.mutedUntil <= Date.now()
      )
        this.ports.alert();
  }
}
