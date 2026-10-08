import type { ServerResponse } from 'node:http';
import type { AccountSession } from '../../shared/account/index.ts';
import { AccountError } from '../../shared/account/index.ts';
import type { CommittedChange, DatabaseChanges } from '../database/index.ts';
interface Stream {
  session: AccountSession;
  response: ServerResponse;
  validate: () => Promise<boolean>;
  checking: Promise<boolean> | null;
  pending: boolean;
  timer: ReturnType<typeof setTimeout> | null;
  expiry: ReturnType<typeof setTimeout>;
}
/** Generic events only; persistence/verification/ACK remain in the signed HTTPS API. */
export class MessageLive {
  private readonly streams = new Map<string, Set<Stream>>();
  private readonly unobserve: () => void;
  private readonly heartbeat: ReturnType<typeof setInterval>;
  private closed = false;
  constructor(changes: DatabaseChanges) {
    this.unobserve = changes.observe({
      notify: (change) => this.notify(change),
      failed: () => this.disconnectAll(),
    });
    this.heartbeat = setInterval(() => this.tick(), 5000);
    this.heartbeat.unref();
  }
  open(input: {
    session: AccountSession;
    response: ServerResponse;
    validate: () => Promise<boolean>;
  }): void {
    if (this.closed)
      throw new AccountError(503, 'Atualização imediata indisponível.');
    const remaining = Date.parse(input.session.expiresAt) - Date.now();
    if (!Number.isFinite(remaining) || remaining <= 0)
      throw new AccountError(401, 'Sessão encerrada ou expirada.');
    // The host's existing socket/resource budgets still apply; no invented 8/2 product quota.
    const stream: Stream = {
      ...input,
      checking: null,
      pending: false,
      timer: null,
      expiry: setTimeout(
        () => this.invalidate(stream, 'ended'),
        Math.min(remaining, 2_147_483_647),
      ),
    };
    stream.expiry.unref();
    const response = input.response;
    response.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Accel-Buffering', 'no');
    response.writeHead(200);
    const group =
      this.streams.get(input.session.accountId) ?? new Set<Stream>();
    group.add(stream);
    this.streams.set(input.session.accountId, group);
    response.once('close', () => this.remove(stream));
    response.once('error', () => this.remove(stream));
    this.write(stream, 'event: ready\ndata: {}\n\n');
  }
  private has(stream: Stream): boolean {
    return this.streams.get(stream.session.accountId)?.has(stream) === true;
  }
  private notify(change: CommittedChange): void {
    for (const account of change.accounts)
      for (const stream of this.streams.get(account) ?? [])
        this.changed(stream, change);
  }
  private changed(stream: Stream, change: CommittedChange): void {
    if (change.ended.includes(stream.session.csrf)) {
      this.invalidate(stream, 'ended');
      return;
    }
    if (change.revoked.includes(stream.session.deviceId)) {
      this.invalidate(stream, 'revoked');
      return;
    }
    if (change.authorization)
      this.write(stream, 'event: authorization\ndata: {}\n\n');
    // This empty control frame only closes content already visible. Like
    // authorization, it must not wait behind normal batching/access checks.
    // It never grants access; subsequent changed/read operations still validate.
    if (change.removed) this.write(stream, 'event: removed\ndata: {}\n\n');
    if (!this.has(stream)) return;
    stream.pending = true;
    if (stream.timer) return;
    stream.timer = setTimeout(() => {
      stream.timer = null;
      void this.flush(stream);
    }, 100);
    stream.timer.unref();
  }
  private check(stream: Stream): Promise<boolean> {
    if (stream.checking) return stream.checking;
    stream.checking = new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => resolve(false), 5000);
      timer.unref();
      void stream
        .validate()
        .then(resolve, () => resolve(false))
        .finally(() => {
          clearTimeout(timer);
          stream.checking = null;
        });
    });
    return stream.checking;
  }
  private async flush(stream: Stream): Promise<void> {
    if (!this.has(stream) || !stream.pending) return;
    if (!(await this.check(stream))) {
      this.invalidate(stream, 'invalidated');
      return;
    }
    if (!this.has(stream) || !stream.pending) return;
    stream.pending = false;
    this.write(stream, 'event: changed\ndata: {}\n\n');
  }
  private tick(): void {
    // Keep-alive comments do not query PostgreSQL or reserve a pool connection.
    for (const group of this.streams.values())
      for (const stream of group) this.write(stream, ': heartbeat\n\n');
  }
  private invalidate(
    stream: Stream,
    event: 'invalidated' | 'revoked' | 'ended',
  ): void {
    if (!this.has(stream)) return;
    this.write(stream, `event: ${event}\ndata: {}\n\n`);
    this.remove(stream);
    stream.response.end();
  }
  private write(stream: Stream, frame: string): void {
    if (!this.has(stream)) return;
    try {
      if (
        !stream.response.destroyed &&
        stream.response.writableLength <= 8192 &&
        stream.response.write(frame)
      )
        return;
    } catch {
      /* A broken socket must reconnect and verify a fresh snapshot. */
    }
    this.remove(stream);
    stream.response.destroy();
  }
  private remove(stream: Stream): void {
    if (stream.timer) clearTimeout(stream.timer);
    clearTimeout(stream.expiry);
    const group = this.streams.get(stream.session.accountId);
    group?.delete(stream);
    if (!group?.size) this.streams.delete(stream.session.accountId);
  }
  private disconnectAll(): void {
    for (const group of this.streams.values())
      for (const stream of group) {
        this.remove(stream);
        stream.response.end();
      }
  }
  close(): void {
    this.closed = true;
    clearInterval(this.heartbeat);
    this.unobserve();
    this.disconnectAll();
  }
}
