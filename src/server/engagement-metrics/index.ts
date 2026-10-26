import type { IncomingMessage, ServerResponse } from 'node:http';
import { AccountError } from '../../shared/account/index.ts';
import {
  engagementObservations,
  engagementVisitor,
} from '../../shared/engagement-metrics/index.ts';
import { RequestBudget } from '../request-budget/index.ts';
import { clientAddress } from '../request-identity/index.ts';
import { CollectionHealth } from './collection-health.ts';
import type { CollectionFailureSummary } from './collection-health.ts';
export { engagementCsv, engagementTable } from './output.ts';

function collectionFailed(error: unknown): boolean {
  return (
    !(error instanceof AccountError) ||
    error.status >= 500 ||
    error.status === 429
  );
}

async function body(request: IncomingMessage): Promise<unknown> {
  const parts: Buffer[] = [];
  let size = 0;
  const timeout = setTimeout(() => request.destroy(), 5000);
  timeout.unref();
  try {
    for await (const part of request) {
      if (!(part instanceof Buffer))
        throw new AccountError(400, 'Invalid collection body.');
      size += part.length;
      if (size > 8192)
        throw new AccountError(413, 'Collection batch is too large.');
      parts.push(part);
    }
    try {
      return JSON.parse(Buffer.concat(parts).toString('utf8')) as unknown;
    } catch {
      throw new AccountError(400, 'Invalid collection JSON.');
    }
  } finally {
    clearTimeout(timeout);
  }
}

export function createEngagementHandler(options: {
  origin: string;
  trustUnixProxy?: boolean;
  observe: (input: unknown) => Promise<void>;
  observeVisitor: (input: unknown) => Promise<void>;
  recordFailures?: (summary: CollectionFailureSummary) => Promise<void>;
}) {
  const budget = new RequestBudget();
  const health = new CollectionHealth(options.recordFailures);
  let active = 0;
  let closed = false;
  async function collect(request: IncomingMessage): Promise<void> {
    if (
      !['/api/engagement/observations', '/api/engagement/visitors'].includes(
        request.url ?? '',
      )
    )
      throw new AccountError(404, 'Collection endpoint not found.');
    if (request.method !== 'POST') throw new AccountError(405, 'Use POST.');
    if (request.headers.origin !== options.origin)
      throw new AccountError(403, 'Invalid collection origin.');
    if (request.headers['content-type'] !== 'application/json')
      throw new AccountError(415, 'Use JSON.');
    budget.admit(
      clientAddress({
        request,
        trustUnixProxy: options.trustUnixProxy === true,
      }),
      false,
    );
    const input = await body(request);
    if (request.url === '/api/engagement/visitors') {
      await options.observeVisitor(engagementVisitor(input));
      return;
    }
    const items = engagementObservations(input);
    await options.observe({ items });
  }
  return {
    async handle(
      request: IncomingMessage,
      response: ServerResponse,
    ): Promise<void> {
      if (closed || active >= 4) {
        if (!closed) health.failed();
        response.writeHead(503).end();
        return;
      }
      active++;
      try {
        await collect(request);
        await health.flush();
        response.writeHead(204).end();
      } catch (error) {
        if (collectionFailed(error)) health.failed();
        if (error instanceof AccountError && error.status === 405)
          response.setHeader('Allow', 'POST');
        response
          .writeHead(error instanceof AccountError ? error.status : 503)
          .end();
      } finally {
        active--;
      }
    },
    close(): void {
      closed = true;
      budget.close();
    },
  };
}
