import type { IncomingMessage, ServerResponse } from 'node:http';
import { AccountError } from '../../shared/account/index.ts';
import {
  approvalDocumentId,
  approvalDocumentPath,
  approvalPathRequest,
  walletApprovalRequest,
} from '../../shared/wallet-approval/index.ts';
import type { WalletApprovalRequest } from '../../shared/wallet-approval/index.ts';
import type { AccountService } from './service.ts';

function entryInput(raw: string, origin: string) {
  if (raw.length > 512) throw new AccountError(400, 'Pedido excedido.');
  const url = new URL(raw, origin);
  if (url.pathname.startsWith('/wallet-entry/')) {
    if (raw !== `${url.pathname}${url.search}`)
      throw new AccountError(400, 'Caminho de aprovação inválido.');
    return pathInput(url, origin);
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

function pathInput(url: URL, origin: string) {
  const input = approvalPathRequest(url.pathname);
  if (!input || url.hash)
    throw new AccountError(400, 'Caminho de aprovação inválido.');
  pathRef(url.searchParams, origin);
  return { input, inline: true };
}

function pathRef(params: URLSearchParams, origin: string): void {
  const names = [...params.keys()];
  if (!names.length) return;
  if (names.length !== 1 || names[0] !== 'ref')
    throw new AccountError(400, 'Metadados de aprovação inválidos.');
  const value = params.get('ref');
  if (value !== origin && value !== `${origin}/`)
    throw new AccountError(400, 'Origem de aprovação inválida.');
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

function documentRejection(raw = '') {
  if (raw === approvalDocumentPath) return;
  if (raw.length > 512) throw new AccountError(400, 'Documento excedido.');
  for (const reason of ['parameters', 'unavailable'] as const) {
    if (raw === `${approvalDocumentPath}?invalid=1&reason=${reason}`)
      return reason;
  }
  throw new AccountError(400, 'Documento de aprovação inválido.');
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
    rejection?: 'parameters' | 'unavailable' | 'missing',
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
  async function pendingState(input: unknown) {
    const state = await service.approvalRequest(input);
    const seconds = Math.max(
      0,
      Math.floor((Date.parse(state.expiresAt) - Date.now()) / 1000),
    );
    if (!seconds) throw new AccountError(401, 'Pedido expirou.');
    return { state, seconds };
  }
  async function enter(request: IncomingMessage, response: ServerResponse) {
    // Embed validated state only. Never log or reflect the raw query, and
    // never accept a redirect destination from it.
    try {
      const entry = entryInput(request.url ?? '', origin);
      const { state, seconds } = await pendingState(entry.input);
      if (request.url?.startsWith('/wallet-entry/')) {
        const value = `${state.request.ticket}.${state.request.wallet}.${state.request.ecosystem}`;
        response.setHeader('Set-Cookie', cookie(value, seconds));
        response.writeHead(303, { Location: approvalDocumentPath }).end();
        return;
      }
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
      response
        .writeHead(303, {
          Location: `${approvalDocumentPath}?invalid=1&reason=${reason}`,
        })
        .end();
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
  async function finalDocument(
    request: IncomingMessage,
    response: ServerResponse,
  ) {
    try {
      const rejected = documentRejection(request.url);
      if (rejected) {
        sendDocument(response, null, rejected);
        return;
      }
      const input = read(request);
      if (!input) {
        sendDocument(response, null, 'missing');
        return;
      }
      if (input.wallet !== 'Backpack')
        throw new AccountError(400, 'Wallet de aprovação inválida.');
      sendDocument(response, (await pendingState(input)).state);
    } catch (error: unknown) {
      if (!(error instanceof AccountError)) throw error;
      // A delayed document response must not erase a newer cookie.
      sendDocument(
        response,
        null,
        error.status === 400 ? 'parameters' : 'unavailable',
      );
    }
  }
  return { enter, restore, document: finalDocument };
}
