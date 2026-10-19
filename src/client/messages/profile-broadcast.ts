import type { ProfileCard } from '../message-profile/index.ts';

/**
 * Sends the own private profile card (name and photo) to every confirmed
 * private contact after it changes, instead of only when a conversation is
 * opened. `share` already skips a contact that has this exact card, so a run
 * after nothing changed costs one local read per contact. Runs one contact at
 * a time and never overlaps; a failure stops the round and the next trigger
 * (profile saved, periodic tick) retries the contacts still missing it.
 */
export class ProfileBroadcast {
  private running = false;
  private done = '';
  private readonly options: {
    card: () => ProfileCard | null;
    peers: () => readonly string[];
    share: (peer: string, card: ProfileCard) => Promise<void>;
    ready: () => boolean;
  };
  constructor(options: ProfileBroadcast['options']) {
    this.options = options;
  }

  async run(selected?: string): Promise<void> {
    if (this.running || !this.options.ready()) return;
    const card = this.options.card();
    if (!card) return;
    // A just-opened approved contact may be outside the loaded directory page.
    const peers = [
      ...new Set([...this.options.peers(), ...(selected ? [selected] : [])]),
    ].sort();
    const key = `${card.revision}:${peers.join(',')}`;
    if (key === this.done) return;
    this.running = true;
    try {
      for (const peer of peers) {
        if (!this.options.ready()) return;
        await this.options.share(peer, card);
      }
      this.done = key;
    } finally {
      this.running = false;
    }
  }
}
