import type { ServerResponse } from 'node:http';
import { AccountError } from '../../shared/account/index.ts';
import type { WorkSignals } from '../database/index.ts';
import { reserveOperationMemory } from '../memory-admission/index.ts';
interface Stream {
  response: ServerResponse;
  expiry: ReturnType<typeof setTimeout>;
  release: () => void;
}
/** Public publication hints only. Reads retain validation and page/generation bounds. */
export class RankingLive {
  private readonly streams = new Set<Stream>();
  private readonly unsubscribe: () => void;
  private readonly heartbeat: ReturnType<typeof setInterval>;
  private closed = false;
  constructor(signals: Pick<WorkSignals, 'subscribe'>) {
    this.unsubscribe = signals.subscribe('ranking-published', () =>
      this.broadcast('event: changed\ndata: {}\n\n'),
    );
    this.heartbeat = setInterval(
      () => this.broadcast(': heartbeat\n\n'),
      20000,
    );
    this.heartbeat.unref();
  }
  open(response: ServerResponse): void {
    if (this.closed) throw new AccountError(503, 'Live update unavailable.');
    // Conservative transport/buffer headroom shared with other owned operations.
    const release = reserveOperationMemory(131072);
    if (!release) throw new AccountError(503, 'Live update unavailable.');
    const stream: Stream = {
      response,
      release,
      expiry: setTimeout(() => this.end(stream), 300000),
    };
    stream.expiry.unref();
    this.streams.add(stream);
    try {
      response.once('close', () => this.remove(stream));
      response.once('error', () => this.remove(stream));
      response.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      response.setHeader('Cache-Control', 'no-store');
      response.setHeader('X-Accel-Buffering', 'no');
      response.writeHead(200);
      this.write(stream, 'event: ready\ndata: {}\n\n');
    } catch (error) {
      this.remove(stream);
      throw error;
    }
  }
  private remove(stream: Stream): void {
    clearTimeout(stream.expiry);
    this.streams.delete(stream);
    stream.release();
  }
  private end(stream: Stream): void {
    this.remove(stream);
    stream.response.end();
  }
  private write(stream: Stream, frame: string): void {
    if (!this.streams.has(stream)) return;
    const { response } = stream;
    try {
      if (
        !response.destroyed &&
        response.writableLength <= 8192 &&
        response.write(frame)
      )
        return;
    } catch {
      /* The browser reconnects and reads the current published generation. */
    }
    this.remove(stream);
    response.destroy();
  }
  private broadcast(frame: string): void {
    for (const stream of this.streams) this.write(stream, frame);
  }
  close(): void {
    this.closed = true;
    clearInterval(this.heartbeat);
    this.unsubscribe();
    for (const stream of this.streams) this.end(stream);
  }
}
