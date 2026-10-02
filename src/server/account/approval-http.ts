import type { IncomingMessage, ServerResponse } from 'node:http';
import { AccountError } from '../../shared/account/index.ts';
import {
  approvalDocumentId,
  approvalPathRequest,
  walletApprovalRequest,
} from '../../shared/wallet-approval/index.ts';
import type { WalletApprovalRequest } from '../../shared/wallet-approval/index.ts';
import type { AccountService } from './service.ts';

function entryInput(raw: string, origin: string) {
  if (raw.length > 512) throw new AccountError(400, 'Pedido excedido.');
  const url = new URL(raw, origin);
  if (url.pathname.startsWith('/wallet-entry/')) {
    if (raw !== url.pathname)
      throw new AccountError(400, 'Caminho de aprovação inválido.');
    return pathInput(url);
  }
  return queryInput(url.searchParams);
}

function queryInput(params: URLSearchParams) {
  const entries = [...params.keys()];
  if (
    entries.length < 3 ||
    entries.length > 5 ||
    new Set(entries).size !== entries.length ||
    entries.some(
      (key) =>
        !['ticket', 'wallet', 'ecosystem', 'returnBrowser', 'view'].includes(
          key,
        ),
    )
  )
    throw new AccountError(400, 'Pedido inválido.');
  const view = params.get('view');
  if (view !== null && (view !== 'page' || params.get('wallet') !== 'Backpack'))
    throw new AccountError(400, 'Modo de aprovação inválido.');
  params.delete('view');
  return { input: Object.fromEntries(params), inline: view === 'page' };
}

function pathInput(url: URL) {
  const input = approvalPathRequest(url.pathname);
  if (!input || url.search || url.hash)
    throw new AccountError(400, 'Caminho de aprovação inválido.');
  return { input, inline: true };
}

function approvalPage(document?: Uint8Array): string | undefined {
  if (!document) return;
  if (document.byteLength > 65_536)
    throw new Error('Documento de aprovação excedido.');
  const page = new TextDecoder('utf-8', { fatal: true }).decode(document);
  if (page.split('</head>').length !== 2)
    throw new Error('Documento de aprovação inválido.');
  return page;
}

/** This cookie can only propose a signature, never authenticate a browser. */
export function createApprovalEntry(
  service: Pick<AccountService, 'approvalRequest'>,
  origin: string,
  document?: Uint8Array,
) {
  const page = approvalPage(document);
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
  function sendDocument(
    response: ServerResponse,
    state: unknown,
    rejection?: 'parameters' | 'unavailable',
  ): void {
    if (!page)
      throw new AccountError(503, 'Documento de aprovação indisponível.');
    const payload = JSON.stringify(state).replaceAll('<', '\\u003c');
    const rejected = rejection ? ` data-rejected="${rejection}"` : '';
    const content = Buffer.from(
      page.replace(
        '</head>',
        `<script type="application/json" id="${approvalDocumentId}"${rejected}>${payload}</script></head>`,
      ),
    );
    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    response.setHeader('Content-Length', content.byteLength);
    response.writeHead(200).end(content);
  }
  async function enter(request: IncomingMessage, response: ServerResponse) {
    // Embed validated state only. Never log or reflect the raw query, and
    // never accept a redirect destination from it.
    try {
      const entry = entryInput(request.url ?? '', origin);
      const state = await service.approvalRequest(entry.input);
      const seconds = Math.max(
        0,
        Math.floor((Date.parse(state.expiresAt) - Date.now()) / 1000),
      );
      if (!seconds) throw new AccountError(401, 'Pedido expirou.');
      if (entry.inline) {
        sendDocument(response, state);
        return;
      }
      const value = `${state.request.ticket}.${state.request.wallet}.${state.request.ecosystem}${state.request.returnBrowser ? '.' + state.request.returnBrowser : ''}`;
      response.setHeader('Set-Cookie', cookie(value, seconds));
      response.writeHead(303, { Location: '/wallet.html#configuracoes' }).end();
    } catch (error: unknown) {
      rejectEntry(request, response, error);
    }
  }
  function rejectEntry(
    request: IncomingMessage,
    response: ServerResponse,
    error: unknown,
  ): void {
    clear(response);
    if (!(error instanceof AccountError)) throw error;
    // An invalid/replayed entry must not restore a previous stored request.
    // Fixed categories only: do not expose tickets, addresses or raw errors.
    const reason = error.status === 400 ? 'parameters' : 'unavailable';
    if (request.url?.startsWith('/wallet-entry/') && page) {
      // Keep rejection on the document too: a wallet must not lose it at a redirect.
      sendDocument(response, null, reason);
      return;
    }
    response
      .writeHead(303, {
        Location: `/wallet.html#configuracoes?invalid=1&reason=${reason}`,
      })
      .end();
  }
  async function restore(request: IncomingMessage) {
    // No Set-Cookie on restore/sign: a delayed response must not erase a newer
    // navigation. Consumed/cancelled tickets fail in the store until cookie expiry.
    const input = read(request);
    return input ? await service.approvalRequest(input) : null;
  }
  return { enter, restore };
}
