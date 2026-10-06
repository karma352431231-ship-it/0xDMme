import type { IncomingMessage, ServerResponse } from 'node:http';
import { AccountError } from '../../shared/account/index.ts';
import { publicProfile } from '../../shared/public-profile/index.ts';
import type { PublicProfile } from '../../shared/public-profile/index.ts';
import { RequestBudget } from '../request-budget/index.ts';

export function createPublicProfileHandler(
  read: (handle: string) => Promise<PublicProfile>,
) {
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
  async function lookup(
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> {
    const head = request.method === 'HEAD';
    if (request.method !== 'GET' && !head) {
      response.setHeader('Allow', 'GET, HEAD');
      throw new AccountError(405, 'Método inválido.');
    }
    const match = /^\/api\/public-profiles\/([A-Za-z0-9_]{3,30})$/u.exec(
      request.url ?? '',
    );
    if (!match?.[1])
      throw new AccountError(404, 'Perfil público indisponível.');
    budget.admit(request.socket.remoteAddress ?? 'unknown', false, true);
    send(response, 200, publicProfile(await read(match[1])), head);
  }
  async function handle(
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> {
    const head = request.method === 'HEAD';
    if (active >= 4) {
      send(
        response,
        503,
        { error: 'Perfis públicos ocupados. Aguarde.' },
        head,
      );
      return;
    }
    active++;
    try {
      await lookup(request, response);
    } catch (error: unknown) {
      send(
        response,
        error instanceof AccountError ? error.status : 503,
        {
          error:
            error instanceof AccountError
              ? error.message
              : 'Perfil público indisponível. Tente novamente.',
        },
        head,
      );
    } finally {
      active--;
    }
  }
  return { handle, close: () => budget.close() };
}
