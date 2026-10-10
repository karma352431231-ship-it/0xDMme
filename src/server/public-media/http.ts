import type { IncomingMessage, ServerResponse } from 'node:http';
import { AccountError, uuid } from '../../shared/account/index.ts';
import { publicMediaPath } from '../../shared/public-media/index.ts';
import type { PublicMediaService } from './service.ts';

function publicRoute(url: string): {
  kind: 'avatar' | 'profile-banner' | 'community-photo' | 'post-media';
  target: string;
  review: string;
  thumbnail: boolean;
} {
  const parts = url.split('/'),
    kind = parts[3];
  if (
    ![6, 7].includes(parts.length) ||
    (kind !== 'avatar' &&
      kind !== 'profile-banner' &&
      kind !== 'community-photo' &&
      kind !== 'post-media')
  )
    throw new AccountError(404, 'Mídia pública indisponível.');
  const target = uuid(parts[4]),
    review = uuid(parts[5]),
    thumbnail = parts.length === 7;
  requireCanonicalRoute({ url, parts, kind, target, review, thumbnail });
  return { kind, target, review, thumbnail };
}
function requireCanonicalRoute(input: {
  url: string;
  parts: string[];
  kind: 'avatar' | 'profile-banner' | 'community-photo' | 'post-media';
  target: string;
  review: string;
  thumbnail: boolean;
}): void {
  if (
    (input.thumbnail &&
      (input.kind !== 'post-media' || input.parts[6] !== 'thumbnail')) ||
    input.url !==
      publicMediaPath(input.kind, input.target, input.review, input.thumbnail)
  )
    throw new AccountError(404, 'Mídia pública indisponível.');
}

/** Anonymous public media has bounded concurrent readers and no per-minute rate cap. */
export function createPublicMediaHandler(service: PublicMediaService) {
  let active = 0;
  async function read(
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> {
    const head = request.method === 'HEAD';
    if (request.method !== 'GET' && !head) {
      response.setHeader('Allow', 'GET, HEAD');
      throw new AccountError(405, 'Método inválido.');
    }
    const { kind, target, review, thumbnail } = publicRoute(request.url ?? '');
    const content =
      kind === 'post-media'
        ? await service.media(target, review, thumbnail)
        : await service.avatar(kind, target, review);
    if (response.destroyed) return;
    response.setHeader('Content-Type', content.type);
    response.setHeader('Content-Length', content.bytes.length);
    response.writeHead(200).end(head ? undefined : content.bytes);
  }
  async function handle(
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    if (active >= 4) {
      response.writeHead(503).end();
      return;
    }
    active++;
    try {
      await read(request, response);
    } catch (error: unknown) {
      if (response.headersSent) {
        response.destroy();
        return;
      }
      response.removeHeader('Content-Length');
      response.setHeader('Content-Type', 'application/json; charset=utf-8');
      response
        .writeHead(error instanceof AccountError ? error.status : 503)
        .end(
          request.method === 'HEAD'
            ? undefined
            : JSON.stringify({
                error:
                  error instanceof AccountError
                    ? error.message
                    : 'Mídia pública indisponível.',
              }),
        );
    } finally {
      active--;
    }
  }
  return {
    handle,
    close: () => {
      /* No timer or reader detached from its request. */
    },
  };
}
