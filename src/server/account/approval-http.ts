import type { IncomingMessage, ServerResponse } from 'node:http';
import { AccountError } from '../../shared/account/index.ts';
import { walletApprovalRequest } from '../../shared/wallet-approval/index.ts';
import type { WalletApprovalRequest } from '../../shared/wallet-approval/index.ts';
import type { AccountService } from './service.ts';

function entryInput(raw: string, origin: string): Record<string, string> {
  if (raw.length > 512) throw new AccountError(400, 'Pedido excedido.');
  const params = new URL(raw, origin).searchParams;
  const entries = [...params.keys()];
  if (
    entries.length < 3 ||
    entries.length > 4 ||
    new Set(entries).size !== entries.length ||
    entries.some(
      (key) =>
        !['ticket', 'wallet', 'ecosystem', 'returnBrowser'].includes(key),
    )
  )
    throw new AccountError(400, 'Pedido inválido.');
  return Object.fromEntries(params);
}

/** This cookie can only propose a signature, never authenticate a browser. */
export function createApprovalEntry(
  service: Pick<AccountService, 'approvalRequest'>,
  origin: string,
) {
  const secure = new URL(origin).protocol === 'https:';
  const name = secure ? '__Host-0xdmme-approval' : '0xdmme-approval';
  function cookie(value: string, seconds: number): string {
    return `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${seconds}${secure ? '; Secure' : ''}`;
  }
  function read(request: IncomingMessage): WalletApprovalRequest | null {
    const matches = (request.headers.cookie ?? '')
      .split(';')
      .map((part) => part.trim())
      .filter((part) => part.startsWith(`${name}=`));
    if (!matches.length) return null;
    if (matches.length !== 1)
      throw new AccountError(400, 'Cookie de aprovação inválido.');
    const [ticket, wallet, ecosystem, browser, extra] =
      matches[0]?.slice(name.length + 1).split('.') ?? [];
    if (extra !== undefined)
      throw new AccountError(400, 'Cookie de aprovação inválido.');
    try {
      return walletApprovalRequest({
        ticket,
        wallet,
        ecosystem,
        ...(browser === undefined ? {} : { returnBrowser: browser }),
      });
    } catch {
      throw new AccountError(400, 'Cookie de aprovação inválido.');
    }
  }
  function clear(response: ServerResponse): void {
    response.setHeader('Set-Cookie', cookie('', 0));
  }
  async function enter(request: IncomingMessage, response: ServerResponse) {
    // No query is reflected, logged or used as a redirect destination.
    try {
      const state = await service.approvalRequest(
        entryInput(request.url ?? '', origin),
      );
      const seconds = Math.max(
        0,
        Math.floor((Date.parse(state.expiresAt) - Date.now()) / 1000),
      );
      if (!seconds) throw new AccountError(401, 'Pedido expirou.');
      const value = `${state.request.ticket}.${state.request.wallet}.${state.request.ecosystem}${state.request.returnBrowser ? '.' + state.request.returnBrowser : ''}`;
      response.setHeader('Set-Cookie', cookie(value, seconds));
      response.writeHead(303, { Location: '/wallet.html#configuracoes' }).end();
    } catch (error: unknown) {
      clear(response);
      if (!(error instanceof AccountError)) throw error;
      // An invalid/replayed entry must not restore a previous stored request.
      // Fixed categories only: do not expose tickets, addresses or raw errors.
      const reason = error.status === 400 ? 'parameters' : 'unavailable';
      response
        .writeHead(303, {
          Location: `/wallet.html#configuracoes?invalid=1&reason=${reason}`,
        })
        .end();
    }
  }
  async function restore(request: IncomingMessage) {
    // No Set-Cookie on restore/sign: a delayed response must not erase a newer
    // navigation. Consumed/cancelled tickets fail in the store until cookie expiry.
    const input = read(request);
    return input ? await service.approvalRequest(input) : null;
  }
  return { enter, restore };
}
