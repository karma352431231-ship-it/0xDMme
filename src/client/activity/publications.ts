import { t } from '../../shared/i18n/index.ts';
import type { ReplyPreview } from '../../shared/community-posts/index.ts';
export function publicationTitle(
  author: string | null | undefined,
  kind: 'post' | 'reply',
): string {
  if (author)
    return t('@{0} {1}', [
      author,
      kind === 'post' ? t('publicou') : t('respondeu'),
    ]);
  return kind === 'post'
    ? t('Nova publicação')
    : t('Nova resposta ao seu conteúdo');
}
export function publicationQuote(
  preview: Pick<ReplyPreview, 'text' | 'media' | 'status'> | null,
  kind: 'post' | 'reply',
): string {
  if (!preview) return '';
  const noun = kind === 'post' ? t('Publicação') : t('Resposta');
  if (preview.status === 'deleted') return noun + t(' excluída pelo autor.');
  if (preview.status === 'removed')
    return noun + t(' ocultada pela moderação.');
  if (preview.text) return preview.text;
  return preview.media ? t('Enviou uma mídia.') : '';
}
