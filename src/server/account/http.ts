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
import type { NotificationService } from '../notifications/index.ts';
import type { MessageLive } from '../message-live/index.ts';
import type { CallService } from '../calls/index.ts';
import type { PublicProfileService } from '../public-profile/index.ts';
import type { CommunityService } from '../communities/index.ts';
import { publicAvatarLimit } from '../../shared/public-avatar/index.ts';
import { blockLimit } from '../../shared/vault/index.ts';
import { createApprovalEntry } from './approval-http.ts';
import { RecoveryReturn } from '../recovery-return/index.ts';
import { EnrollmentLinks } from '../device-enrollment/index.ts';
import { recoveryEntry } from '../../shared/wallet-recovery/index.ts';
import {
  approvalDocumentUrl,
  approvalEntryUrl,
} from '../../shared/wallet-approval/index.ts';

const challengeRoutes = new Set([
  '/api/account/challenge',
  '/api/account/handoff-start',
  '/api/account/handoff-challenge',
  '/api/account/recovery-start',
  '/api/account/enrollment-join',
]);
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

const messageBodyBudgets = new Map<string, number>([
  ['dm-attachment-part', 360000],
  ['dm-attachment-reserve', 12000],
  ['dm-register', 75000],
  ['dm-publish', 8200000],
  ['dm-matrix-upload', 200000],
  ['dm-matrix-claim', 60000],
  ['dm-matrix-send', 8400000],
  ['group-message-publish', 6_700_000],
  ['group-matrix-send', 8_400_000],
  ['group-matrix-claim', 60_000],
  ['group-commit', 75_000],
  ['group-propose', 8_000],
  ['attachment-part', 360_000],
  ['group-attachment-part', 365_000],
  ['group-attachment-reserve', 12_000],
  ['status-attachment-reserve', 12_000],
  ['status-attachment-part', 365_000],
  ['status-recipients', 200_000],
  ['status-publish', 5_800_000],
  ['attachment-reserve', 12_000],
  ['publish', 8_200_000],
  ['matrix-upload', 200_000],
  ['matrix-send', 1_100_000],
]);
function messageBodyLimit(url: string): number {
  return messageBodyBudgets.get(url.slice(url.lastIndexOf('/') + 1)) ?? 4096;
}
function bodyLimit(url: string | undefined): number {
  if (
    url === '/api/account/public-profile/avatar' ||
    url === '/api/account/communities/photo'
  )
    return Math.ceil(publicAvatarLimit / 3) * 4 + 4096;
  if (url === '/api/account/communities/media-part') return 360_000;
  if (url?.startsWith('/api/account/communities/')) return 28000;
  return accountBodyLimit(url);
}
function accountBodyLimit(url: string | undefined): number {
  if (url?.startsWith('/api/account/calls/'))
    return url.endsWith('/offer') ? 365_000 : 16_000;
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
  notifications?: NotificationService;
  live?: MessageLive;
  calls?: CallService;
  publicProfiles?: PublicProfileService;
  communities?: CommunityService;
}) {
  const secure = new URL(options.origin).protocol === 'https:';
  const sessionName = secure ? '__Host-hash-talk-session' : 'hash-talk-session';
  const challengeName = secure
    ? '__Host-hash-talk-challenge'
    : 'hash-talk-challenge';
  // Normal API reads/writes and upload parts have no per-minute transport quota.
  // Login challenges retain their independent protection.
  const limit = new AccountRateLimit({ requests: null });
  // Call control keeps separate pre-auth transport and authenticated command
  // budgets; synchronization/end have no separate per-minute read quota.
  const callAdmission = new AccountRateLimit({ requests: 900 });
  const callSessions = new AccountRateLimit();
  const recovery = new RecoveryReturn(options.origin);
  const enrollments = options.devices
    ? new EnrollmentLinks(options.devices)
    : null;
  const handoffName = secure ? '__Host-hash-talk-return' : 'hash-talk-return';
  const approval = createApprovalEntry(
    options.service,
    options.origin,
    options.approvalDocument,
  );
  let active = 0;

  async function enrollmentJoin(
    request: IncomingMessage,
    response: ServerResponse,
    input: unknown,
  ): Promise<boolean> {
    if (request.url !== '/api/account/enrollment-join' || !enrollments)
      return false;
    const login = await enrollments.join(
      input,
      (source, device) =>
        options.service.beginLinked(
          source,
          device,
          readCookie(request, sessionName),
        ),
      (token) => options.service.logout(token),
    );
    response.setHeader(
      'Set-Cookie',
      cookie(sessionName, login.sessionToken, sessionSeconds, secure),
    );
    send(response, 200, login.session);
    return true;
  }
  async function post(
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> {
    if (request.headers.origin !== options.origin)
      throw new AccountError(403, 'Origem inválida.');
    if (await earlyVaultPost(request, response)) return;
    if (await earlyMessagePost(request, response)) return;
    const input = await body(request);
    if (await enrollmentJoin(request, response, input)) return;
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
      if (request.url.endsWith('/dm-attachment-part'))
        await options.messages.preflightSocialAttachment(
          await options.service.session(token),
          request.headers['x-0xdmme-attachment-id'],
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
      if (request.url === '/api/account/messages/live' && options.live) {
        await livePost(response, sessionToken, input);
        return true;
      }
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
  async function livePost(
    response: ServerResponse,
    token: string,
    input: unknown,
  ): Promise<void> {
    const session = await options.service.session(token);
    const head = await options.messages?.operate('live', session, input);
    if (typeof head !== 'string')
      throw new AccountError(503, 'Canal indisponível.');
    const validate = async () => {
      const [current, authorized] = await Promise.all([
        options.service.session(token),
        options.messages?.liveCurrent(session, head),
      ]);
      return (
        current.accountId === session.accountId &&
        current.deviceId === session.deviceId &&
        current.csrf === session.csrf &&
        authorized === true
      );
    };
    if (!(await validate()))
      throw new AccountError(403, 'Canal sem autorização atual.');
    if (!response.destroyed)
      options.live?.open({ session, response, validate });
  }
  async function devicePost(
    request: IncomingMessage,
    response: ServerResponse,
    sessionToken: string,
    input: unknown,
  ): Promise<boolean> {
    if (!request.url?.startsWith('/api/account/devices/') || !options.devices)
      return false;
    const session = await options.service.session(sessionToken);
    if (
      request.url === '/api/account/devices/enrollment-create' &&
      enrollments
    ) {
      send(response, 200, await enrollments.create(session, input));
      return true;
    }
    if (
      request.url === '/api/account/devices/enrollment-pending' &&
      enrollments
    ) {
      send(response, 200, await enrollments.pending(session, input));
      return true;
    }
    send(
      response,
      200,
      await options.devices.operate(
        request.url.slice('/api/account/devices/'.length),
        session,
        input,
      ),
    );
    return true;
  }
  async function authenticatedPost(
    request: IncomingMessage,
    response: ServerResponse,
    sessionToken: string,
    input: unknown,
  ): Promise<void> {
    if (await socialPost(request, response, sessionToken, input)) return;
    if (await callPost(request, response, sessionToken, input)) return;
    if (await contactPost(request, response, sessionToken, input)) return;
    if (request.url?.startsWith('/api/account/recovery-')) {
      await privateRecoveryPost(request, response, sessionToken, input);
      return;
    }
    if (await devicePost(request, response, sessionToken, input)) return;
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
  async function socialPost(
    request: IncomingMessage,
    response: ServerResponse,
    token: string,
    input: unknown,
  ): Promise<boolean> {
    if (await communityPost(request, response, token, input)) return true;
    if (
      !request.url?.startsWith('/api/account/public-profile/') ||
      !options.publicProfiles
    )
      return false;
    send(
      response,
      200,
      await options.publicProfiles.operate(
        request.url.slice('/api/account/public-profile/'.length),
        await options.service.session(token),
        input,
      ),
    );
    return true;
  }
  async function communityPost(
    request: IncomingMessage,
    response: ServerResponse,
    token: string,
    input: unknown,
  ): Promise<boolean> {
    if (
      !request.url?.startsWith('/api/account/communities/') ||
      !options.communities
    )
      return false;
    send(
      response,
      200,
      await options.communities.operate(
        request.url.slice('/api/account/communities/'.length),
        await options.service.session(token),
        input,
      ),
    );
    return true;
  }
  async function callPost(
    request: IncomingMessage,
    response: ServerResponse,
    token: string,
    input: unknown,
  ): Promise<boolean> {
    if (!request.url?.startsWith('/api/account/calls/') || !options.calls)
      return false;
    const session = await options.service.session(token);
    callSessions.admit(
      session.csrf,
      false,
      request.url.endsWith('/sync') || request.url.endsWith('/end'),
    );
    send(
      response,
      200,
      await options.calls.operate(
        request.url.slice('/api/account/calls/'.length),
        session,
        input,
      ),
    );
    return true;
  }

  function admit(request: IncomingMessage): void {
    if (request.url?.startsWith('/api/account/calls/')) {
      callAdmission.admit(request.socket.remoteAddress ?? 'unknown', false);
      return;
    }
    limit.admit(
      request.socket.remoteAddress ?? 'unknown',
      challengeRoutes.has(request.url ?? '') || approvalEntryUrl(request.url),
    );
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
      admit(request);
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
    if (await notificationsGet(request, response, sessionToken)) return;
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
  async function notificationsGet(
    request: IncomingMessage,
    response: ServerResponse,
    token: string,
  ): Promise<boolean> {
    if (request.url === '/api/account/push-check' && options.notifications) {
      send(
        response,
        200,
        await options.notifications.inspectPush(
          await options.service.session(token),
        ),
      );
      return true;
    }
    return false;
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
    let rejected = false;
    try {
      recovery.requestPublic(entry);
    } catch (error: unknown) {
      if (!(error instanceof AccountError) || error.status !== 409) throw error;
      rejected = true;
    }
    let document = options.recoveryDocument;
    if (!document || document.length > 65_536)
      throw new AccountError(503, 'Página de recuperação indisponível.');
    if (rejected)
      document = Buffer.from(
        new TextDecoder()
          .decode(document)
          .replace('<html ', '<html data-recovery-rejected '),
      );
    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    response.setHeader('Content-Length', document.length);
    response.writeHead(200).end(document);
    return true;
  }
  return {
    handle,
    close: () => {
      options.live?.close();
      options.calls?.close();
      limit.close();
      callAdmission.close();
      callSessions.close();
      recovery.close();
      enrollments?.close();
    },
  };
}
