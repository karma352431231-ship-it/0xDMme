import type { ServerResponse } from 'node:http';
import { getHeapStatistics } from 'node:v8';
import { AccountError } from '../../shared/account/index.ts';
import type { WorkSignals } from '../database/index.ts';
/** Public publication hints only. Reads retain validation and page/generation bounds. */
export class RankingLive {
  private readonly streams = new Set<ServerResponse>();
  private readonly unsubscribe: () => void;
  private readonly heartbeat: ReturnType<typeof setInterval>;
  private closed = false;
  private readonly capacity = Math.max(
    1,
    Math.floor(
      Math.min(process.availableMemory(), getHeapStatistics().heap_size_limit) /
        16384,
    ),
  );
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
    if (this.closed || this.streams.size >= this.capacity)
      throw new AccountError(503, 'Live update unavailable.');
    response.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Accel-Buffering', 'no');
    response.writeHead(200);
    this.streams.add(response);
    const expiry = setTimeout(() => response.end(), 300000);
    expiry.unref();
    const remove = () => {
      clearTimeout(expiry);
      this.streams.delete(response);
    };
    response.once('close', remove);
    response.once('error', remove);
    this.write(response, 'event: ready\ndata: {}\n\n');
  }
  private write(response: ServerResponse, frame: string): void {
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
    this.streams.delete(response);
    response.destroy();
  }
  private broadcast(frame: string): void {
    for (const response of this.streams) this.write(response, frame);
  }
  close(): void {
    this.closed = true;
    clearInterval(this.heartbeat);
    this.unsubscribe();
    for (const response of this.streams) response.end();
    this.streams.clear();
  }
}
