import type { IncomingMessage, ServerResponse } from 'node:http';
import { AccountError, uuid } from '../../shared/account/index.ts';
import {
  community,
  communityCursor,
  communityPage,
} from '../../shared/communities/index.ts';
import type {
  Community,
  CommunityPage,
} from '../../shared/communities/index.ts';
import { RequestBudget } from '../request-budget/index.ts';

export function createCommunityHandler(read: {
  read: (id: string) => Promise<Community>;
  list: (after: string | null) => Promise<CommunityPage>;
}) {
  const budget = new RequestBudget();
  let active = 0;
  function send(
    response: ServerResponse,
    status: number,
    data: unknown,
    head: boolean,
  ): void {
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.writeHead(status).end(head ? undefined : JSON.stringify(data));
  }
  async function lookup(request: IncomingMessage): Promise<unknown> {
    if (request.method !== 'GET' && request.method !== 'HEAD')
      throw new AccountError(405, 'Método inválido.');
    budget.admit(request.socket.remoteAddress ?? 'unknown', false, true);
    const address = new URL(request.url ?? '', 'http://local.invalid');
    if (address.pathname === '/api/communities') {
      if (
        [...address.searchParams.keys()].some((key) => key !== 'after') ||
        address.searchParams.getAll('after').length > 1
      )
        throw new AccountError(400, 'Cursor inválido.');
      return communityPage(
        await read.list(communityCursor(address.searchParams.get('after'))),
      );
    }
    if (
      address.search ||
      !/^\/api\/communities\/[a-f0-9-]{36}$/u.test(address.pathname)
    )
      throw new AccountError(404, 'Comunidade indisponível.');
    return community(
      await read.read(uuid(address.pathname.slice('/api/communities/'.length))),
    );
  }
  async function handle(
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> {
    const head = request.method === 'HEAD';
    if (active >= 4) {
      send(response, 503, { error: 'Comunidades ocupadas. Aguarde.' }, head);
      return;
    }
    active++;
    try {
      send(response, 200, await lookup(request), head);
    } catch (error: unknown) {
      if (error instanceof AccountError && error.status === 405)
        response.setHeader('Allow', 'GET, HEAD');
      send(
        response,
        error instanceof AccountError ? error.status : 503,
        {
          error:
            error instanceof AccountError
              ? error.message
              : 'Comunidade indisponível. Tente novamente.',
        },
        head,
      );
    } finally {
      active--;
    }
  }
  return { handle, close: () => budget.close() };
}
