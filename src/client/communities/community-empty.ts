import { t } from '../../shared/i18n/index.ts';
import { communityElement as el } from './elements.ts';

/**
 * A community without posts (31/10/2026): one quiet line where the posts will
 * appear. The composer bar above already invites the first post, so there is
 * no second call to action and no list of other communities.
 */
export function emptyCommunity(host: HTMLElement): void {
  host.append(el('p', t('community.empty.note'), 'community-empty-note'));
}
