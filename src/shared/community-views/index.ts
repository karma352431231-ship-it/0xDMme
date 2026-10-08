import { AccountError, keys, object, uuid } from '../account/index.ts';
import { postCount } from '../community-posts/index.ts';

export interface PostObservation {
  community: string;
  post: string;
  token: string;
}
export interface PostViews {
  id: string;
  views: number;
}
export function postObservations(value: unknown): PostObservation[] {
  const data = object(value);
  keys(data, ['items']);
  const items = data['items'];
  if (!Array.isArray(items) || items.length < 1 || items.length > 24)
    throw new AccountError(400, 'Lote de visualizações inválido.');
  const seen = new Set<string>();
  return items.map((value: unknown) => {
    const item = object(value);
    keys(item, ['community', 'post', 'token']);
    const post = uuid(item['post']),
      token = item['token'];
    if (
      seen.has(post) ||
      typeof token !== 'string' ||
      !/^[a-f0-9]{32}$/u.test(token)
    )
      throw new AccountError(400, 'Marca de visualização inválida.');
    seen.add(post);
    return { community: uuid(item['community']), post, token };
  });
}
export function postViewsPage(value: unknown): PostViews[] {
  const data = object(value);
  keys(data, ['items']);
  if (!Array.isArray(data['items']) || data['items'].length > 24)
    throw new AccountError(400, 'Contagens inválidas.');
  return data['items'].map((value: unknown) => {
    const item = object(value);
    keys(item, ['id', 'views']);
    return { id: uuid(item['id']), views: postCount(item['views']) };
  });
}
