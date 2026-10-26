import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import type { Socket } from 'node:net';
import type { DiagnosticEvent, RequestArea } from './model.ts';

function requestArea(url = ''): RequestArea {
  if (url.startsWith('/health/')) return 'health';
  if (url.startsWith('/api/account/')) return 'account';
  return url.startsWith('/api/') ? 'public' : 'asset';
}
/** Only counters and fixed categories; never retain request metadata. */
export class TrafficDiagnostics {
  private counters = {
    started: 0,
    completed: 0,
    errors: 0,
    slow: 0,
    aborted: 0,
  };
  private activeRequests = 0;
  private activeConnections = 0;
  private closed = false;
  private readonly event: (event: DiagnosticEvent) => void;
  constructor(event: (event: DiagnosticEvent) => void) {
    this.event = event;
  }
  private complete(
    response: ServerResponse,
    input: { began: number; area: RequestArea },
  ): void {
    if (!response.writableFinished) {
      if (this.streaming(response)) return;
      this.counters.aborted++;
      this.event({ reason: 'request-aborted', area: input.area });
      return;
    }
    this.counters.completed++;
    if (response.statusCode >= 500) {
      this.counters.errors++;
      this.event({
        reason: input.area === 'health' ? 'health-unavailable' : 'server-error',
        area: input.area,
      });
    }
    if (!this.streaming(response) && performance.now() - input.began >= 2000) {
      this.counters.slow++;
      this.event({
        reason: 'slow-request',
        area: input.area,
        elapsedMs: Math.round(performance.now() - input.began),
      });
    }
  }
  private streaming(response: ServerResponse): boolean {
    return String(response.getHeader('Content-Type')).startsWith(
      'text/event-stream',
    );
  }
  observe = (request: IncomingMessage, response: ServerResponse): void => {
    if (this.closed) return;
    const input = { began: performance.now(), area: requestArea(request.url) };
    this.counters.started++;
    this.activeRequests++;
    const deadline = setTimeout(() => {
      if (this.closed || this.streaming(response)) return;
      const elapsedMs = Math.round(performance.now() - input.began);
      this.event({
        reason: 'slow-request',
        area: input.area,
        elapsedMs,
        deadlineDelayMs: Math.max(0, elapsedMs - 2000),
      });
    }, 2000);
    deadline.unref();
    const done = () => {
      clearTimeout(deadline);
      response.removeListener('finish', done);
      response.removeListener('close', done);
      this.activeRequests--;
      if (!this.closed) this.complete(response, input);
    };
    response.once('finish', done);
    response.once('close', done);
  };
  connection = (socket: Socket): void => {
    if (this.closed) return;
    this.activeConnections++;
    socket.once('close', () => {
      this.activeConnections--;
    });
  };
  attach(server: Server): () => void {
    server.prependListener('request', this.observe);
    server.on('connection', this.connection);
    return () => {
      this.closed = true;
      server.removeListener('request', this.observe);
      server.removeListener('connection', this.connection);
    };
  }
  snapshot() {
    const counters = this.counters;
    this.counters = {
      started: 0,
      completed: 0,
      errors: 0,
      slow: 0,
      aborted: 0,
    };
    return {
      ...counters,
      activeRequests: this.activeRequests,
      activeConnections: this.activeConnections,
    };
  }
}
