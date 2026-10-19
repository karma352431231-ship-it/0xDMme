import type { IncomingMessage, ServerResponse } from 'node:http';
import { AccountError, uuid } from '../../shared/account/index.ts';
import { publicMediaPath } from '../../shared/public-media/index.ts';
import type { PublicMediaService } from './service.ts';
import { reserveOperationMemory } from '../memory-admission/index.ts';
import { sendPublicMedia } from './body.ts';
import type { PublicMediaBody } from './body.ts';

function publicRoute(url: string): {
  kind:
    | 'avatar'
    | 'profile-banner'
    | 'community-photo'
    | 'community-banner'
    | 'post-media';
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
      kind !== 'community-banner' &&
      kind !== 'post-media')
  )
    throw new AccountError(404, 'Public media unavailable.');
  const target = uuid(parts[4]),
    review = uuid(parts[5]),
    thumbnail = parts.length === 7;
  requireCanonicalRoute({ url, parts, kind, target, review, thumbnail });
  return { kind, target, review, thumbnail };
}
function requireCanonicalRoute(input: {
  url: string;
  parts: string[];
  kind:
    | 'avatar'
    | 'profile-banner'
    | 'community-photo'
    | 'community-banner'
    | 'post-media';
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
    throw new AccountError(404, 'Public media unavailable.');
}

/** Request-owned memory, deadline and file descriptor; no reader outlives cancellation. */
export function createPublicMediaHandler(service: PublicMediaService) {
  const stopped = new AbortController();
  async function read(
    request: IncomingMessage,
    response: ServerResponse,
    signal: AbortSignal,
  ): Promise<void> {
    const head = request.method === 'HEAD';
    if (request.method !== 'GET' && !head) {
      response.setHeader('Allow', 'GET, HEAD');
      throw new AccountError(405, 'Invalid method.');
    }
    const { kind, target, review, thumbnail } = publicRoute(request.url ?? '');
    // Prepared files use bounded hash/stream buffers; avatars still come from SQL.
    const release = reserveOperationMemory(
      kind === 'post-media' ? 524_288 : 6_524_288,
    );
    if (!release) throw new AccountError(503, 'Public media unavailable.');
    let content: PublicMediaBody | undefined;
    try {
      signal.throwIfAborted();
      content =
        kind === 'post-media'
          ? await service.media(target, review, thumbnail, signal)
          : await service.avatar(kind, target, review);
      if (response.destroyed) return;
      await sendPublicMedia(request, response, content, signal);
    } finally {
      try {
        if (content && 'file' in content) await content.file.close();
      } finally {
        release();
      }
    }
  }
  async function handle(
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    const cancelled = new AbortController();
    const abort = () => {
      if (!response.writableFinished) cancelled.abort();
    };
    const deadline = setTimeout(() => cancelled.abort(), 60_000);
    deadline.unref();
    request.once('aborted', abort);
    response.once('close', abort);
    try {
      await read(
        request,
        response,
        AbortSignal.any([cancelled.signal, stopped.signal]),
      );
    } catch (error: unknown) {
      if (response.headersSent || response.destroyed) {
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
                    : 'Public media unavailable.',
              }),
        );
    } finally {
      clearTimeout(deadline);
      request.removeListener('aborted', abort);
      response.removeListener('close', abort);
    }
  }
  return { handle, close: () => stopped.abort() };
}
