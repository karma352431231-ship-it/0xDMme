import type { IncomingMessage, ServerResponse } from 'node:http';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createHash } from 'node:crypto';
import { AccountError } from '../../shared/account/index.ts';
import type { PendingPublicAvatar } from '../../shared/public-avatar/index.ts';
import { mediaRange } from './range.ts';
import type { MediaRange } from './range.ts';
import type { VerifiedMediaFile } from './file.ts';

export type PublicMediaBody =
  PendingPublicAvatar | { type: string; file: VerifiedMediaFile };

/** Every range has already passed the same current-visibility/integrity checks as GET. */
function selectRange(
  request: IncomingMessage,
  response: ServerResponse,
  value: { length: number; etag: string },
): MediaRange | null {
  const { length, etag } = value,
    head = request.method === 'HEAD';
  const header =
    head ||
    (request.headers['if-range'] && request.headers['if-range'] !== etag)
      ? undefined
      : request.headers.range;
  try {
    return mediaRange(header, length);
  } catch (error: unknown) {
    if (error instanceof AccountError && error.status === 416)
      response.setHeader('Content-Range', `bytes */${length}`);
    throw error;
  }
}

function contentHash(content: PublicMediaBody): string {
  return 'bytes' in content
    ? createHash('sha256').update(content.bytes).digest('hex')
    : content.file.hash;
}

export async function sendPublicMedia(
  request: IncomingMessage,
  response: ServerResponse,
  content: PublicMediaBody,
  signal: AbortSignal,
): Promise<void> {
  signal.throwIfAborted();
  const length =
    'bytes' in content ? content.bytes.length : content.file.length;
  const etag = `"${contentHash(content)}"`;
  const selected = selectRange(request, response, { length, etag });
  const range = selected ?? { start: 0, end: length - 1 };
  response.setHeader('Content-Type', content.type);
  response.setHeader('Content-Length', range.end - range.start + 1);
  response.setHeader('Accept-Ranges', 'bytes');
  response.setHeader('ETag', etag);
  if (selected)
    response.setHeader(
      'Content-Range',
      `bytes ${range.start}-${range.end}/${length}`,
    );
  response.writeHead(selected ? 206 : 200);
  if (request.method === 'HEAD') {
    response.end();
    return;
  }
  if ('bytes' in content) {
    response.end(content.bytes.subarray(range.start, range.end + 1));
    return;
  }
  await pipeline(
    Readable.from(content.file.read(range, signal), {
      objectMode: false,
      highWaterMark: 65_536,
    }),
    response,
    { signal },
  );
}
