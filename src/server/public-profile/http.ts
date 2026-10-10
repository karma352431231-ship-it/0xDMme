import type { IncomingMessage, ServerResponse } from 'node:http';
import { AccountError } from '../../shared/account/index.ts';
import { publicProfile } from '../../shared/public-profile/index.ts';
import type { PublicProfile } from '../../shared/public-profile/index.ts';
import { RequestBudget } from '../request-budget/index.ts';
import { profileSummary } from '../../shared/profile-social/index.ts';
import { feedPage } from '../../shared/community-discovery/index.ts';
import { communityPage } from '../../shared/communities/index.ts';
import type { PublicProfileService } from './service.ts';

export function createPublicProfileHandler(
  read: (handle: string) => Promise<PublicProfile>,
  pages?: Pick<PublicProfileService, 'summary' | 'memberships' | 'activity'>,
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
    const address = new URL(request.url ?? '', 'http://public.invalid');
    const match =
      /^\/api\/public-profiles\/([A-Za-z0-9_]{3,30})(?:\/(page|activity|communities))?$/u.exec(
        address.pathname,
      );
    if (!match?.[1])
      throw new AccountError(404, 'Perfil público indisponível.');
    budget.admit(request.socket.remoteAddress ?? 'unknown', false, true);
    send(
      response,
      200,
      await pageRead(match[1], match[2], address.searchParams),
      head,
    );
  }
  async function pageRead(
    handle: string,
    section: string | undefined,
    query: URLSearchParams,
  ): Promise<unknown> {
    const allowed =
      section === 'activity'
        ? ['tab', 'after']
        : section === 'communities'
          ? ['after']
          : [];
    if (
      [...query.keys()].some(
        (key) => !allowed.includes(key) || query.getAll(key).length !== 1,
      )
    )
      throw new AccountError(400, 'Filtros inválidos.');
    if (!section) return publicProfile(await read(handle));
    if (!pages) throw new AccountError(404, 'Página pública indisponível.');
    if (section === 'page') return profileSummary(await pages.summary(handle));
    if (section === 'communities')
      return communityPage(await pages.memberships(handle, query.get('after')));
    return feedPage(
      await pages.activity(
        handle,
        query.get('tab') ?? 'overview',
        query.get('after'),
      ),
    );
  }
  async function handle(
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> {
    const head = request.method === 'HEAD';
    response.setHeader('Cache-Control', 'no-store');
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
