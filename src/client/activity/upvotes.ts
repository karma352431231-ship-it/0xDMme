import { t, currentLanguage } from '../../shared/i18n/index.ts';
import type { UpvoteNotice } from '../../shared/public-upvotes/index.ts';
import { publicIdentityAvatar } from '../public-identity/index.ts';
import { noticeLink, bindNoticeRow } from './notice-link.ts';

/** Group presentation only; each arrival keeps its own read/seen identifier. */
export function groupUpvoteNotices(
  items: readonly UpvoteNotice[],
): UpvoteNotice[][] {
  const groups = new Map<string, UpvoteNotice[]>();
  for (const item of items) {
    const group = groups.get(item.post) ?? [];
    group.push(item);
    groups.set(item.post, group);
  }
  return [...groups.values()];
}
export function upvoteTitle(items: readonly UpvoteNotice[]): string {
  const first = items[0]!;
  const count = items.length - 1;
  const key =
    first.kind === 'post'
      ? count
        ? '@{0} and {1} others upvoted your post'
        : '@{0} upvoted your post'
      : count
        ? '@{0} and {1} others upvoted your reply'
        : '@{0} upvoted your reply';
  return t(
    key,
    count
      ? [first.actor.handle, count.toLocaleString(currentLanguage())]
      : [first.actor.handle],
  );
}
export function upvoteRows(
  items: readonly UpvoteNotice[],
  actions: {
    signal: AbortSignal;
    current: () => boolean;
    open: (ids: readonly string[]) => Promise<void>;
    changed: () => void;
    preview: (text: string) => HTMLElement;
  },
): HTMLElement[] {
  return groupUpvoteNotices(items).map((group) => {
    const first = group[0]!;
    const row = document.createElement('li'),
      copy = document.createElement('div'),
      faces = document.createElement('div'),
      title = document.createElement('strong'),
      quote = actions.preview(first.text),
      time = document.createElement('small');
    row.className = 'activity-row activity-upvote';
    row.dataset['read'] = String(group.every((item) => item.read));
    copy.className = 'activity-copy';
    faces.className = 'activity-upvote-avatars';
    for (const item of group.slice(0, 3))
      faces.append(publicIdentityAvatar(item.actor, actions.signal));
    title.textContent = upvoteTitle(group);
    time.textContent = new Date(first.createdAt).toLocaleString(
      currentLanguage(),
    );
    copy.append(faces, title, quote, time);
    const controls = document.createElement('div');
    controls.className = 'activity-actions';
    const link = noticeLink({
      label: t('Open'),
      href: `#communities?id=${first.community}&post=${first.post}`,
      read: group.every((item) => item.read),
      acknowledge: () =>
        actions.open(group.filter((item) => !item.read).map((item) => item.id)),
      current: actions.current,
      acknowledged: () => {
        for (const item of group) item.read = true;
        row.dataset['read'] = 'true';
        actions.changed();
      },
    });
    controls.append(link);
    row.append(copy, controls);
    bindNoticeRow(row, link);
    return row;
  });
}
