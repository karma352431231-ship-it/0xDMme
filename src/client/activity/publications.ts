import { t } from '../../shared/i18n/index.ts';
import type { ReplyPreview } from '../../shared/community-posts/index.ts';
export function publicationTitle(
  author: string | null | undefined,
  kind: 'post' | 'reply',
): string {
  if (author)
    return t('@{0} {1}', [
      author,
      kind === 'post' ? t('posted') : t('replied'),
    ]);
  return kind === 'post'
    ? t('New publication')
    : t('New reply to your content');
}
export function publicationQuote(
  preview: Pick<ReplyPreview, 'text' | 'media' | 'status'> | null,
  kind: 'post' | 'reply',
): string {
  if (!preview) return '';
  const noun = kind === 'post' ? t('Publication') : t('Reply');
  if (preview.status === 'deleted') return noun + t(' deleted by the author.');
  if (preview.status === 'removed') return noun + t(' hidden by moderation.');
  if (preview.text) return preview.text;
  return preview.media ? t('Sent media.') : '';
}
