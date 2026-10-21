import { expectedInterruption } from '../synchronization-work/index.ts';
import { t, translatedError } from '../../shared/i18n/index.ts';
import type { SocialRelation } from '../../shared/social-dm/index.ts';
import type { PublicProfile } from '../../shared/public-profile/index.ts';
import { paintAvatar } from '../appearance/index.ts';
import { paintConversationPreview } from '../conversation-preview/index.ts';
import type { ConversationPreview } from '../conversation-preview/index.ts';
import { showPublicAvatar } from '../public-media/index.ts';
import { communityElement as el } from './elements.ts';

/** A public directory stays live independently of the selected conversation.
 * It owns at most one server page of rows and releases photo URLs on replacement. */
export class DmDirectory {
  private host: HTMLElement | null = null;
  private valid: () => boolean = () => false;
  private generation = 0;
  private photos = new AbortController();
  private readonly rows = new Map<
    string,
    { key: string; row: HTMLElement; stop: () => void }
  >();
  private readonly source: {
    list: () => Promise<{ items: SocialRelation[] }>;
    previews: (
      peers: readonly string[],
    ) => Promise<Map<string, ConversationPreview>>;
  };
  constructor(source: DmDirectory['source']) {
    this.source = source;
  }
  get available(): boolean {
    return this.host !== null && this.valid();
  }
  mount(host: HTMLElement, valid: () => boolean): Promise<void> {
    if (host === this.host) {
      this.valid = valid;
      return this.refresh();
    }
    this.clear();
    this.host = host;
    this.valid = valid;
    return this.refresh();
  }
  clear(): void {
    this.generation++;
    this.photos.abort();
    this.photos = new AbortController();
    this.clearRows();
    this.host?.replaceChildren();
    this.host = null;
  }
  invalidate(): void {
    this.generation++;
    this.clearRows();
    if (this.available)
      this.host?.replaceChildren(el('p', t('Opening conversation…')));
  }
  async refresh(): Promise<void> {
    if (!this.available || !this.host) return;
    const generation = ++this.generation,
      host = this.host;
    try {
      const page = await this.source.list();
      if (!this.current(generation)) return;
      this.paintRelations(host, page.items);
      const previews = await this.source.previews(
        page.items.map((row) => row.peer.id),
      );
      if (!this.current(generation)) return;
      paintDmDirectoryPreviews(host, previews);
    } catch (error: unknown) {
      if (expectedInterruption(error)) throw error;
      if (this.current(generation))
        host.replaceChildren(
          el(
            'p',
            error instanceof Error
              ? translatedError(error.message)
              : t('preview.unavailable'),
          ),
        );
    }
  }
  private current(generation: number): boolean {
    return generation === this.generation && this.available;
  }
  private paintRelations(host: HTMLElement, items: SocialRelation[]): void {
    const keep = new Set(items.map((row) => row.peer.id));
    for (const [id, held] of this.rows)
      if (!keep.has(id)) {
        held.stop();
        this.rows.delete(id);
      }
    host.replaceChildren();
    for (const relation of items) host.append(this.row(relation));
    if (!items.length)
      host.append(
        el(
          'p',
          t(
            'No handle conversations yet. Open a public profile to send a message.',
          ),
        ),
      );
    const all = el('a', t('All handle messages'));
    all.href = '#communities?view=dms';
    host.append(all);
  }
  private clearRows(): void {
    for (const held of this.rows.values()) held.stop();
    this.rows.clear();
  }
  private row(relation: SocialRelation): HTMLElement {
    const key = JSON.stringify(relation),
      previous = this.rows.get(relation.peer.id);
    if (previous?.key === key) return previous.row;
    previous?.stop();
    const row = dmDirectoryRow(relation),
      avatar = row.querySelector<HTMLElement>('.conversation-avatar');
    const stop =
      avatar && relation.peer.avatar
        ? showPublicAvatar(avatar, {
            kind: 'avatar',
            target: relation.peer.id,
            reference: relation.peer.avatar,
            signal: this.photos.signal,
          })
        : () => {};
    this.rows.set(relation.peer.id, { key, row, stop });
    return row;
  }
}
export function paintDmDirectoryPreviews(
  host: HTMLElement,
  previews: ReadonlyMap<string, ConversationPreview>,
): void {
  for (const row of host.querySelectorAll<HTMLElement>('[data-dm-peer-row]')) {
    const preview = previews.get(row.dataset['dmPeerRow'] ?? ''),
      copy = row.querySelector<HTMLElement>('.conversation-copy');
    if (preview && copy) paintConversationPreview(copy, preview);
  }
}
export function dmDirectoryRow(
  row: SocialRelation | { peer: PublicProfile; label: string },
  extra = '',
): HTMLAnchorElement {
  const link = el('a', '', 'conversation-row public-row');
  link.dataset['dmPeerRow'] = row.peer.id;
  link.href = `#communities?view=dms&dm=${row.peer.id}${extra}`;
  const avatar = el('span', '', 'conversation-avatar');
  avatar.setAttribute('aria-hidden', 'true');
  paintAvatar(avatar, { label: row.peer.handle, seed: row.peer.id });
  const copy = el('span', '', 'conversation-copy');
  copy.append(
    el('strong', `@${row.peer.handle}`),
    el('small', 'label' in row ? row.label : relationLabel(row)),
  );
  link.append(avatar, copy);
  return link;
}
function relationLabel(row: SocialRelation): string {
  if (row.blocked) return t('Blocked');
  return row.canSend ? t('Conversation') : t('DM unavailable.');
}
