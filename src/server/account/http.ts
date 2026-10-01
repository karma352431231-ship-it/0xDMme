import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  AccountError,
  encryptedProfileLimit,
  keys,
  object,
} from '../../shared/account/index.ts';
import { AccountService, challengeSeconds, sessionSeconds } from './service.ts';
import { AccountRateLimit } from './rate-limit.ts';

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

async function body(request: IncomingMessage): Promise<unknown> {
  if (request.headers['content-type'] !== 'application/json')
    throw new AccountError(415, 'Use JSON.');
  const maximum =
    request.url === '/api/account/profile'
      ? Math.ceil(encryptedProfileLimit / 3) * 4 + 256
      : 4096;
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
}) {
  const secure = new URL(options.origin).protocol === 'https:';
  const sessionName = secure ? '__Host-hash-talk-session' : 'hash-talk-session';
  const challengeName = secure
    ? '__Host-hash-talk-challenge'
    : 'hash-talk-challenge';
  const limit = new AccountRateLimit();
  const handoffName = secure ? '__Host-hash-talk-return' : 'hash-talk-return';
  let active = 0;

  async function post(
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> {
    if (request.headers.origin !== options.origin)
      throw new AccountError(403, 'Origem inválida.');
    const input = await body(request);
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

  async function authenticatedPost(
    request: IncomingMessage,
    response: ServerResponse,
    sessionToken: string,
    input: unknown,
  ): Promise<void> {
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
          request.url === '/api/account/handoff-challenge',
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
    if (request.url === '/api/account/config') {
      send(response, 200, {
        walletConnection: 'native',
        ecosystems: ['evm', 'solana'],
      });
      return;
    }
    if (request.url === '/api/account/handoff-status') {
      send(
        response,
        200,
        await options.service.handoffStatus(readCookie(request, handoffName)),
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
  return { handle, close: () => limit.close() };
}
