import { keys, object, uuid } from '../../shared/account/index.ts';
import { canonical, digest, fingerprint } from '../../shared/devices/index.ts';
import { integer } from '../../shared/vault/index.ts';
import type { VaultEntry, VaultSync } from '../vault-sync/index.ts';

export type StarSync = Pick<
  VaultSync,
  'complete' | 'heads' | 'currentHeads' | 'isRemoved' | 'openMany' | 'save'
>;
/** One encrypted record per starred message (owner, 12/11/2026). */
export const starRecordLabel = '0xdmme:star:v1';
const excerptLimit = 160;

/** A starred message as kept in the person's vault. */
export interface StarredMessage {
  /** The private contact or group the message belongs to. */
  conversation: string;
  id: string;
  hash: string;
  sequence: number;
  excerpt: string;
  sentAt?: number;
}
interface StarValue extends StarredMessage {
  starred: boolean;
}

async function starEntity(
  account: string,
  conversation: string,
  id: string,
): Promise<string> {
  const hash = await digest(
    canonical(['0xdmme-star', 1, account, conversation, id]),
  );
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

export function starExcerpt(text: string): string {
  const clean = text.replace(/\s+/gu, ' ').trim();
  return clean.length > excerptLimit
    ? `${clean.slice(0, excerptLimit)}…`
    : clean;
}

function starValue(input: unknown): StarValue {
  const d = object(input);
  keys(d, [
    'version',
    'conversation',
    'id',
    'hash',
    'sequence',
    'excerpt',
    'starred',
    ...(Object.hasOwn(d, 'sentAt') ? ['sentAt'] : []),
  ]);
  if (
    d['version'] !== 1 ||
    typeof d['starred'] !== 'boolean' ||
    typeof d['excerpt'] !== 'string' ||
    d['excerpt'].length > excerptLimit + 1
  )
    throw new Error('Invalid starred message.');
  return {
    conversation: uuid(d['conversation']),
    id: uuid(d['id']),
    hash: fingerprint(d['hash']),
    sequence: integer(d['sequence'], Number.MAX_SAFE_INTEGER),
    excerpt: d['excerpt'],
    starred: d['starred'],
    ...(d['sentAt'] === undefined
      ? {}
      : { sentAt: integer(d['sentAt'], Number.MAX_SAFE_INTEGER) }),
  };
}

/**
 * The person's starred messages, synced across their devices through the
 * encrypted vault. Never sent to the other participants. Unstarring writes a
 * new version, so concurrent devices converge on the newest choice.
 */
export class MessageStars {
  private readonly sync: StarSync;
  private readonly account: () => string | undefined;
  private known = new Map<string, boolean>();
  private generation = 0;
  constructor(sync: StarSync, account: () => string | undefined) {
    this.sync = sync;
    this.account = account;
  }
  clear(): void {
    this.generation++;
    this.known = new Map();
  }
  starred(id: string): boolean {
    return this.known.get(id) === true;
  }
  /** Reads the star of each listed message; true when any state changed. */
  async load(conversation: string, ids: readonly string[]): Promise<boolean> {
    const account = this.account(),
      generation = this.generation;
    if (!account || !this.sync.complete) return false;
    const heads: VaultEntry[] = [];
    for (const id of ids) {
      if (this.known.has(id)) continue;
      const head = this.head(await starEntity(account, conversation, id));
      if (head) heads.push(head);
      else this.known.set(id, false);
    }
    let changed = false;
    for (const value of await this.read(heads)) {
      if (generation !== this.generation) return false;
      if (value.conversation !== conversation) continue;
      changed ||= this.known.get(value.id) !== value.starred;
      this.known.set(value.id, value.starred);
    }
    return changed;
  }
  /** Shows the new state at once; saving to the vault follows and the
   * state goes back when it fails (12/11/2026). */
  async toggle(message: StarredMessage): Promise<boolean> {
    const account = this.account(),
      generation = this.generation;
    if (!account) throw new Error('Session ended.');
    const starred = !this.starred(message.id);
    this.known.set(message.id, starred);
    try {
      await this.save(account, message, starred);
    } catch (error: unknown) {
      if (generation === this.generation) this.known.set(message.id, !starred);
      throw error;
    }
    return starred;
  }
  private async save(
    account: string,
    message: StarredMessage,
    starred: boolean,
  ): Promise<void> {
    const entity = await starEntity(account, message.conversation, message.id),
      parents = this.sync
        .heads(entity)
        .filter((entry) => this.current(entry))
        .map((entry) => entry.commit.id);
    if (parents.length > 16)
      throw new Error('Too many versions of this star. Sync, then try again.');
    const value: StarValue = {
      ...message,
      excerpt: starExcerpt(message.excerpt),
      starred,
    };
    await this.sync.save({
      change: {
        version: 1,
        entity,
        kind: 'settings',
        parents,
        label: starRecordLabel,
      },
      value: JSON.stringify({ version: 1, ...value }),
    });
  }
  /** Every starred message of one conversation, newest first. */
  async list(conversation: string): Promise<StarredMessage[]> {
    const generation = this.generation,
      heads = [...this.sync.currentHeads().values()]
        .map((entries) => entries.filter((entry) => this.current(entry)))
        .map((entries) => newest(entries))
        .filter((entry): entry is VaultEntry => !!entry);
    const values = await this.read(heads);
    if (generation !== this.generation) return [];
    for (const value of values) this.known.set(value.id, value.starred);
    return values
      .filter((value) => value.conversation === conversation && value.starred)
      .sort((a, b) => b.sequence - a.sequence)
      .map((value) => {
        const { starred, ...message } = value;
        void starred;
        return message;
      });
  }
  private current(entry: VaultEntry): boolean {
    return (
      entry.change.kind === 'settings' &&
      entry.change.label === starRecordLabel &&
      !this.sync.isRemoved(entry.commit.id)
    );
  }
  private head(entity: string): VaultEntry | undefined {
    return newest(this.sync.heads(entity).filter((e) => this.current(e)));
  }
  /** Opens the records sixteen at a time, the vault's page size. */
  private async read(entries: readonly VaultEntry[]): Promise<StarValue[]> {
    const values: StarValue[] = [];
    for (let offset = 0; offset < entries.length; offset += 16) {
      const page = entries.slice(offset, offset + 16);
      const raw = await this.sync.openMany(page.map((e) => e.commit.id));
      for (const text of raw) values.push(starValue(JSON.parse(text)));
    }
    return values;
  }
}
function newest(entries: readonly VaultEntry[]): VaultEntry | undefined {
  return [...entries].sort((a, b) => b.commit.sequence - a.commit.sequence)[0];
}

/** What a star keeps of a shown message: its identity and a short excerpt. */
export function starredMessage(
  view: {
    id: string;
    hash: string;
    sequence?: number;
    sentAt?: number;
    kind: string;
    content: { text: string };
  },
  conversation: string,
  fallback: string,
): StarredMessage {
  return {
    conversation,
    id: view.id,
    hash: view.hash,
    sequence: view.sequence ?? 0,
    excerpt: starExcerpt(view.content.text) || fallback,
    ...(view.sentAt === undefined ? {} : { sentAt: view.sentAt }),
  };
}

/** What a conversation needs from the person's stars. */
export interface ConversationStars {
  starred: (id: string) => boolean;
  /** Reads the stars of the shown messages; true when any changed. */
  load: (conversation: string, ids: string[]) => Promise<boolean>;
  toggle: (message: StarredMessage) => Promise<void>;
  /** Opens the starred list of one conversation. */
  showList: (
    conversation: string,
    open: (message: StarredMessage) => void,
  ) => void;
}
