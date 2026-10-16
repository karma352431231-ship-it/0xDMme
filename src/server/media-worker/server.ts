import { createServer } from 'node:net';
import type { Server, Socket } from 'node:net';
import { mediaProcess } from '../community-media/index.ts';
import type { MediaRuntime } from '../community-media/index.ts';
import { reserveOperationMemory } from '../memory-admission/index.ts';
import {
  mediaWorkerRequest,
  verifyWorkerPaths,
  shareWorkerOutput,
} from './request.ts';

export class MediaWorkerServer {
  readonly server: Server;
  private readonly stop = new AbortController();
  private readonly jobs = new Set<Promise<void>>();
  private readonly connections = new Set<Socket>();
  private closing: Promise<void> | null = null;
  private readonly runtime: MediaRuntime;
  private readonly root: string;
  constructor(options: { runtime: MediaRuntime; root: string }) {
    this.runtime = options.runtime;
    this.root = options.root;
    this.server = createServer({ allowHalfOpen: true }, (socket) =>
      this.accept(socket),
    );
  }
  close(): Promise<void> {
    this.closing ??= this.shutdown();
    return this.closing;
  }
  private async shutdown(): Promise<void> {
    this.stop.abort();
    for (const socket of this.connections) socket.destroy();
    if (this.server.listening)
      await new Promise<void>((resolve, reject) =>
        this.server.close((error) => (error ? reject(error) : resolve())),
      );
    await Promise.all(this.jobs);
  }
  private accept(socket: Socket): void {
    const release = reserveOperationMemory(262_144);
    if (!release) {
      socket.destroy();
      return;
    }
    let payload = '';
    const disconnected = new AbortController();
    this.connections.add(socket);
    socket.setEncoding('utf8');
    socket.setTimeout(370_000, () => socket.destroy());
    socket.on('error', () => disconnected.abort());
    socket.once('close', () => {
      disconnected.abort();
      this.connections.delete(socket);
      release();
    });
    socket.on('data', (chunk: string) => {
      payload += chunk;
      if (Buffer.byteLength(payload) > 65_536) socket.destroy();
    });
    socket.once('end', () => {
      const job = this.execute(socket, payload, disconnected.signal);
      this.jobs.add(job);
      void job.then(
        () => this.jobs.delete(job),
        () => {
          this.jobs.delete(job);
          socket.destroy();
        },
      );
    });
  }
  private async execute(
    socket: Socket,
    payload: string,
    disconnected: AbortSignal,
  ): Promise<void> {
    try {
      const request = mediaWorkerRequest(JSON.parse(payload) as unknown);
      this.stop.signal.throwIfAborted();
      if (!request) {
        socket.end(
          JSON.stringify({ ok: true, output: '0xdmme-media-worker-v1' }),
        );
        return;
      }
      const signal = AbortSignal.any([
        this.stop.signal,
        disconnected,
        AbortSignal.timeout(360_000),
      ]);
      signal.throwIfAborted();
      const paths = await verifyWorkerPaths(this.root, request);
      const output = await mediaProcess(this.runtime, { ...request, signal });
      await shareWorkerOutput(paths);
      socket.end(JSON.stringify({ ok: true, output }));
    } catch {
      if (!socket.destroyed) socket.end(JSON.stringify({ ok: false }));
    }
  }
}
