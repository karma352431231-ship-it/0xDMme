import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  AccountError,
  encryptedProfileLimit,
  keys,
  object,
} from '../../shared/account/index.ts';
import { AccountService, challengeSeconds, sessionSeconds } from './service.ts';
import { AccountRateLimit } from './rate-limit.ts';
import type { DeviceService } from '../devices/index.ts';
import type { VaultService } from '../vault/index.ts';
import type { MessageService } from '../messages/index.ts';
import type { ContactService } from '../contacts/index.ts';
import { blockLimit } from '../../shared/vault/index.ts';
import { createApprovalEntry } from './approval-http.ts';
import { RecoveryReturn } from '../recovery-return/index.ts';
import { recoveryEntry } from '../../shared/wallet-recovery/index.ts';
import {
  approvalDocumentUrl,
  approvalEntryUrl,
} from '../../shared/wallet-approval/index.ts';

function readCookie(request: IncomingMessage, name: string): string {
  const matches = (request.headers.cookie ?? '')
    .split(';')
    .map((item) => item.trim())
    .filter((item) => item.startsWith(`${name}=`));
  if (matches.length !== 1) return '';
  const value = matches[0]?.slice(name.length + 1) ?? '';
  return /^[a-f0-9]{64}$/u.test(value) ? value : '';
}

function cookie(
  name: string,
  value: string,
  seconds: number,
  secure: boolean,
): string {
  return `${name}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${seconds}${secure ? '; Secure' : ''}`;
}

function messageBodyLimit(url: string): number {
  if (url.endsWith('/attachment-part')) return 360_000;
  if (url.endsWith('/attachment-reserve')) return 12_000;
  if (url.endsWith('/publish')) return 8_200_000;
  if (url.endsWith('/matrix-upload')) return 200_000;
  if (url.endsWith('/matrix-send')) return 1_100_000;
  return 4096;
}
function bodyLimit(url: string | undefined): number {
  if (url?.startsWith('/api/account/messages/')) return messageBodyLimit(url);
  return url === '/api/account/vault/upload'
    ? Math.ceil(blockLimit / 3) * 4 + 10000
    : url === '/api/account/profile' ||
        url === '/api/account/devices/commit' ||
        url === '/api/account/devices/profile'
      ? Math.ceil(encryptedProfileLimit / 3) * 4 + 70_000
      : 4096;
}

async function body(request: IncomingMessage): Promise<unknown> {
  if (request.headers['content-type'] !== 'application/json')
    throw new AccountError(415, 'Use JSON.');
  const maximum = bodyLimit(request.url);
  const parts: Buffer[] = [];
  let size = 0;
  const timer = setTimeout(() => request.destroy(), 5000);
  timer.unref();
  try {
    for await (const value of request) {
      if (!(value instanceof Buffer))
        throw new AccountError(400, 'Corpo inválido.');
      size += value.length;
      if (size > maximum) throw new AccountError(413, 'Pedido excedido.');
      parts.push(value);
    }
    try {
      return JSON.parse(
        new TextDecoder('utf-8', { fatal: true }).decode(
          Buffer.concat(parts, size),
        ),
      ) as unknown;
    } catch {
      throw new AccountError(400, 'JSON inválido.');
    }
  } finally {
    clearTimeout(timer);
  }
}

function send(response: ServerResponse, status: number, data: unknown): void {
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.writeHead(status).end(JSON.stringify(data));
}

export function createAccountHandler(options: {
  service: AccountService;
  origin: string;
  walletConnectProjectId?: string;
  approvalDocument?: Uint8Array;
  recoveryDocument?: Uint8Array;
  devices?: DeviceService;
  vault?: VaultService;
  contacts?: ContactService;
  messages?: MessageService;
}) {
  const secure = new URL(options.origin).protocol === 'https:';
  const sessionName = secure ? '__Host-hash-talk-session' : 'hash-talk-session';
  const challengeName = secure
    ? '__Host-hash-talk-challenge'
    : 'hash-talk-challenge';
  const limit = new AccountRateLimit();
  const recovery = new RecoveryReturn(options.origin);
  const handoffName = secure ? '__Host-hash-talk-return' : 'hash-talk-return';
  const approval = createApprovalEntry(
    options.service,
    options.origin,
    options.approvalDocument,
  );
  let active = 0;

  async function post(
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> {
    if (request.headers.origin !== options.origin)
      throw new AccountError(403, 'Origem inválida.');
    if (await earlyVaultPost(request, response)) return;
    if (await earlyMessagePost(request, response)) return;
    const input = await body(request);
    if (publicRecoveryPost(request, response, input)) return;
    if (request.url?.startsWith('/api/account/handoff-')) {
      await handoffPost(request, response, input);
      return;
    }
    if (request.url === '/api/account/challenge') {
      const challenge = await options.service.challenge(input);
      response.setHeader(
        'Set-Cookie',
        cookie(challengeName, challenge.browserToken, challengeSeconds, secure),
      );
      send(response, 200, {
        id: challenge.id,
        message: challenge.message,
        expiresAt: challenge.expiresAt,
      });
      return;
    }
    const sessionToken = readCookie(request, sessionName);
    if (request.url === '/api/account/login') {
      const login = await options.service.login(
        input,
        readCookie(request, challengeName),
        sessionToken,
      );
      response.setHeader('Set-Cookie', [
        cookie(sessionName, login.sessionToken, sessionSeconds, secure),
        cookie(challengeName, '', 0, secure),
      ]);
      send(response, 200, login.session);
      return;
    }
    await options.service.authorize(
      sessionToken,
      request.headers['x-hash-talk-csrf'],
    );
    await authenticatedPost(request, response, sessionToken, input);
  }

  async function earlyVaultPost(
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<boolean> {
    if (!request.url?.startsWith('/api/account/vault/') || !options.vault)
      return false;
    await vaultPost(request, response);
    return true;
  }
  async function earlyMessagePost(
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<boolean> {
    if (request.url?.startsWith('/api/account/messages/') && options.messages) {
      const token = readCookie(request, sessionName);
      await options.service.authorize(
        token,
        request.headers['x-hash-talk-csrf'],
      );
      if (request.url.endsWith('/attachment-part'))
        await options.messages.preflightAttachment(
          await options.service.session(token),
          request.headers['x-0xdmme-attachment-id'],
        );
      await messagePost(request, response, token, await body(request));
      return true;
    }
    return false;
  }
  function publicRecoveryPost(
    request: IncomingMessage,
    response: ServerResponse,
    input: unknown,
  ): boolean {
    if (
      request.url !== '/api/account/recovery-request' &&
      request.url !== '/api/account/recovery-submit'
    )
      return false;
    send(
      response,
      200,
      request.url.endsWith('request')
        ? recovery.requestPublic(input)
        : recovery.submit(input),
    );
    return true;
  }
  async function vaultPost(
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> {
    const token = readCookie(request, sessionName);
    await options.service.authorize(token, request.headers['x-hash-talk-csrf']);
    const session = await options.service.session(token);
    if (request.url === '/api/account/vault/upload')
      await options.vault?.preflight(
        session,
        request.headers['x-0xdmme-vault-id'],
      );
    const input = await body(request);
    send(
      response,
      200,
      await options.vault?.operate(
        request.url?.slice('/api/account/vault/'.length) ?? '',
        session,
        input,
      ),
    );
  }

  async function handoffPost(
    request: IncomingMessage,
    response: ServerResponse,
    input: unknown,
  ): Promise<void> {
    const browserToken = readCookie(request, handoffName);
    if (request.url === '/api/account/handoff-start') {
      const handoff = await options.service.startHandoff(input, browserToken);
      response.setHeader(
        'Set-Cookie',
        cookie(handoffName, handoff.browserToken, challengeSeconds, secure),
      );
      send(response, 200, {
        ticket: handoff.ticket,
        expiresAt: handoff.expiresAt,
        serverTime: new Date().toISOString(),
      });
      return;
    }
    if (request.url === '/api/account/handoff-challenge') {
      const challenge = await options.service.handoffChallenge(input);
      response.setHeader(
        'Set-Cookie',
        cookie(challengeName, challenge.browserToken, challengeSeconds, secure),
      );
      send(response, 200, {
        id: challenge.id,
        message: challenge.message,
        expiresAt: challenge.expiresAt,
      });
      return;
    }
    if (request.url === '/api/account/handoff-sign') {
      await options.service.signHandoff(
        input,
        readCookie(request, challengeName),
      );
      response.setHeader('Set-Cookie', cookie(challengeName, '', 0, secure));
      send(response, 200, { status: 'signed', origin: options.origin });
      return;
    }
    if (request.url === '/api/account/handoff-cancel') {
      keys(object(input), []);
      await options.service.cancelHandoff(browserToken);
      response.setHeader('Set-Cookie', cookie(handoffName, '', 0, secure));
      send(response, 200, { status: 'cancelled' });
      return;
    }
    if (request.url === '/api/account/handoff-confirm') {
      const login = await options.service.finishHandoff(
        input,
        browserToken,
        readCookie(request, sessionName),
      );
      response.setHeader('Set-Cookie', [
        cookie(sessionName, login.sessionToken, sessionSeconds, secure),
        cookie(handoffName, '', 0, secure),
      ]);
      send(response, 200, login.session);
      return;
    }
    throw new AccountError(404, 'Operação não encontrada.');
  }

  async function privateRecoveryPost(
    request: IncomingMessage,
    response: ServerResponse,
    sessionToken: string,
    input: unknown,
  ): Promise<void> {
    const session = await options.service.session(sessionToken);
    let result: unknown;
    switch (request.url) {
      case '/api/account/recovery-start':
        result = await recovery.start(session, input);
        break;
      case '/api/account/recovery-take':
        result = recovery.take(session, input);
        break;
      case '/api/account/recovery-cancel':
        result = recovery.cancel(session, input);
        break;
      default:
        throw new AccountError(404, 'Operação não encontrada.');
    }
    send(response, 200, result);
  }
  async function contactPost(
    request: IncomingMessage,
    response: ServerResponse,
    sessionToken: string,
    input: unknown,
  ): Promise<boolean> {
    if (!request.url?.startsWith('/api/account/contacts/') || !options.contacts)
      return false;
    const session = await options.service.session(sessionToken);
    send(
      response,
      200,
      await options.contacts.operate(
        request.url.slice('/api/account/contacts/'.length),
        session,
        input,
      ),
    );
    return true;
  }
  async function messagePost(
    request: IncomingMessage,
    response: ServerResponse,
    sessionToken: string,
    input: unknown,
  ): Promise<boolean> {
    if (request.url?.startsWith('/api/account/messages/') && options.messages) {
      send(
        response,
        200,
        await options.messages.operate(
          request.url.slice('/api/account/messages/'.length),
          await options.service.session(sessionToken),
          input,
        ),
      );
      return true;
    }
    return false;
  }
  async function authenticatedPost(
    request: IncomingMessage,
    response: ServerResponse,
    sessionToken: string,
    input: unknown,
  ): Promise<void> {
    if (await contactPost(request, response, sessionToken, input)) return;
    if (request.url?.startsWith('/api/account/recovery-')) {
      await privateRecoveryPost(request, response, sessionToken, input);
      return;
    }
    if (request.url?.startsWith('/api/account/devices/') && options.devices) {
      const session = await options.service.session(sessionToken);
      send(
        response,
        200,
        await options.devices.operate(
          request.url.slice('/api/account/devices/'.length),
          session,
          input,
        ),
      );
      return;
    }
    if (request.url === '/api/account/logout') {
      await options.service.logout(sessionToken);
      response.setHeader('Set-Cookie', cookie(sessionName, '', 0, secure));
      send(response, 200, { status: 'signed-out' });
      return;
    }
    if (request.url === '/api/account/name') {
      send(response, 200, await options.service.rename(sessionToken, input));
      return;
    }
    if (request.url === '/api/account/profile') {
      await options.service.saveProfile(sessionToken, input);
      send(response, 200, { status: 'saved' });
      return;
    }
    throw new AccountError(404, 'Operação não encontrada.');
  }

  async function handle(
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> {
    if (active >= 4) {
      send(response, 503, { error: 'Conta ocupada. Aguarde.' });
      return;
    }
    active++;
    try {
      limit.admit(
        request.socket.remoteAddress ?? 'unknown',
        request.url === '/api/account/challenge' ||
          request.url === '/api/account/handoff-start' ||
          request.url === '/api/account/handoff-challenge' ||
          request.url === '/api/account/recovery-start' ||
          approvalEntryUrl(request.url),
      );
      if (request.method === 'POST') {
        await post(request, response);
        return;
      }
      await get(request, response);
    } catch (error: unknown) {
      if (error instanceof AccountError) {
        send(response, error.status, { error: error.message });
        return;
      }
      send(response, 503, { error: 'Conta indisponível. Tente novamente.' });
    } finally {
      active--;
    }
  }
  async function get(
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> {
    if (request.method !== 'GET')
      throw new AccountError(405, 'Método inválido.');
    if (await approvalGet(request, response)) return;
    if (recoveryGet(request, response)) return;
    if (request.url === '/api/account/config') {
      send(response, 200, {
        walletConnection: 'native',
        ecosystems: ['evm', 'solana'],
      });
      return;
    }
    if (request.url === '/api/account/handoff-status') {
      const state = await options.service.handoffStatus(
        readCookie(request, handoffName),
      );
      send(
        response,
        200,
        state && { ...state, serverTime: new Date().toISOString() },
      );
      return;
    }
    const sessionToken = readCookie(request, sessionName);
    if (request.url === '/api/account/session') {
      send(response, 200, await options.service.session(sessionToken));
      return;
    }
    if (request.url === '/api/account/profile') {
      send(response, 200, await options.service.profile(sessionToken));
      return;
    }
    throw new AccountError(404, 'Operação não encontrada.');
  }
  async function approvalGet(
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<boolean> {
    if (approvalEntryUrl(request.url) || approvalDocumentUrl(request.url)) {
      if (
        request.headers['sec-fetch-mode'] !== 'navigate' ||
        request.headers['sec-fetch-dest'] !== 'document'
      )
        throw new AccountError(403, 'Entrada exige navegação de documento.');
      if (approvalDocumentUrl(request.url))
        await approval.document(request, response);
      else await approval.enter(request, response);
      return true;
    }
    if (request.url === '/api/account/approval-request') {
      send(response, 200, await approval.restore(request));
      return true;
    }
    return false;
  }
  function recoveryGet(
    request: IncomingMessage,
    response: ServerResponse,
  ): boolean {
    const entry = recoveryEntry(request.url);
    if (!entry) return false;
    if (
      request.headers['sec-fetch-mode'] !== 'navigate' ||
      request.headers['sec-fetch-dest'] !== 'document'
    )
      throw new AccountError(403, 'Entrada exige navegação de documento.');
    recovery.requestPublic(entry);
    const document = options.recoveryDocument;
    if (!document || document.length > 65_536)
      throw new AccountError(503, 'Página de recuperação indisponível.');
    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    response.setHeader('Content-Length', document.length);
    response.writeHead(200).end(document);
    return true;
  }
  return {
    handle,
    close: () => {
      limit.close();
      recovery.close();
    },
  };
}
