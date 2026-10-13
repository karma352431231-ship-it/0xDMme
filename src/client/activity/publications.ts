import type { ReplyPreview } from '../../shared/community-posts/index.ts';
export function publicationTitle(
  author: string | null | undefined,
  kind: 'post' | 'reply',
): string {
  if (author) return `@${author} ${kind === 'post' ? 'publicou' : 'respondeu'}`;
  return kind === 'post' ? 'Nova publicação' : 'Nova resposta ao seu conteúdo';
}
export function publicationQuote(
  preview: Pick<ReplyPreview, 'text' | 'media' | 'status'> | null,
  kind: 'post' | 'reply',
): string {
  if (!preview) return '';
  const noun = kind === 'post' ? 'Publicação' : 'Resposta';
  if (preview.status === 'deleted') return noun + ' excluída pelo autor.';
  if (preview.status === 'removed') return noun + ' ocultada pela moderação.';
  if (preview.text) return preview.text;
  return preview.media ? 'Enviou uma mídia.' : '';
}

/** Read rows stay visible, but never contribute to pending notification badges. */
export function unreadNotices(items: readonly { read?: boolean }[]): number {
  return items.filter((item) => !item.read).length;
}
