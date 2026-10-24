import { AccountHttpCookies } from './http-cookies.ts';
import { sendAccountJson } from './http-response.ts';
import { readAccountBody } from './http-body.ts';
import { AccountRecoveryHttp } from './recovery-http.ts';
import { AccountEnrollmentHttp } from './enrollment-http.ts';
import { AccountMessageHttp, messageBodyLimit } from './message-http.ts';
import { AccountCallHttp, callBodyLimit } from './call-http.ts';
import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  AccountError,
  encryptedProfileLimit,
} from '../../shared/account/index.ts';
import { AccountService, challengeSeconds, sessionSeconds } from './service.ts';
import { AccountRateLimit } from './rate-limit.ts';
import { clientAddress } from '../request-identity/index.ts';
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
function bodyLimit(url: string | undefined): number {
  if (url === '/api/account/communities/presentation')
    return 2 * Math.ceil(publicAvatarLimit / 3) * 4 + 28000;
  if (
    url === '/api/account/public-profile/avatar' ||
    url === '/api/account/public-profile/banner' ||
    url === '/api/account/communities/photo'
  )
    return Math.ceil(publicAvatarLimit / 3) * 4 + 4096;
  if (url === '/api/account/communities/media-part') return 360_000;
  if (url?.startsWith('/api/account/communities/')) return 28000;
  return accountBodyLimit(url);
}
function accountBodyLimit(url: string | undefined): number {
  if (url?.startsWith('/api/account/calls/')) return callBodyLimit(url);
  if (url?.startsWith('/api/account/messages/')) return messageBodyLimit(url);
  return url === '/api/account/vault/upload'
    ? Math.ceil(blockLimit / 3) * 4 + 10000
    : url === '/api/account/profile' ||
        url === '/api/account/devices/commit' ||
        url === '/api/account/devices/profile'
      ? Math.ceil(encryptedProfileLimit / 3) * 4 + 70_000
      : 4096;
}

function body(request: IncomingMessage): Promise<unknown> {
  return readAccountBody(request, bodyLimit(request.url));
}

export function createAccountHandler(options: {
  service: AccountService;
  origin: string;
  trustUnixProxy?: boolean;
  walletConnectProjectId?: string;
  /** Public by nature: the browser uses it to call KLIPY directly. */
  gifSearchKey?: string;
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
  const cookies = new AccountHttpCookies(options.origin);
  // Normal API reads/writes and upload parts have no per-minute transport quota.
  // Login challenges retain their independent protection.
  const limit = new AccountRateLimit({ requests: null });
  const recovery = new AccountRecoveryHttp(
    {
      service: options.service,
      origin: () => options.origin,
      devices: options.devices,
      recoveryDocument: options.recoveryDocument,
    },
    cookies,
  );
  const enrollments = new AccountEnrollmentHttp(
    { service: options.service, devices: options.devices },
    cookies,
  );
  const messages = new AccountMessageHttp(
    {
      service: options.service,
      messages: options.messages,
      live: options.live,
    },
    cookies,
  );
  const calls = new AccountCallHttp({
    service: options.service,
    calls: options.calls,
  });
  const approval = createApprovalEntry(
    options.service,
    options.origin,
    options.approvalDocument,
  );
  async function post(
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> {
    if (request.headers.origin !== options.origin)
      throw new AccountError(403, 'Invalid origin.');
    if (await earlyVaultPost(request, response)) return;
    if (await messages.post(request, response)) return;
    const input = await body(request);
    if (await enrollments.join(request, response, input)) return;
    if (await recovery.post(request, response, input)) return;
    if (request.url === '/api/account/challenge') {
      const challenge = await options.service.challenge(input);
      response.setHeader(
        'Set-Cookie',
        cookies.write('challenge', challenge.browserToken, challengeSeconds),
      );
      sendAccountJson(response, 200, {
        id: challenge.id,
        message: challenge.message,
        expiresAt: challenge.expiresAt,
      });
      return;
    }
    const sessionToken = cookies.read(request, 'session');
    if (request.url === '/api/account/login') {
      const login = await options.service.login(
        input,
        cookies.read(request, 'challenge'),
        sessionToken,
      );
      response.setHeader('Set-Cookie', [
        cookies.write('session', login.sessionToken, sessionSeconds),
        cookies.write('challenge', '', 0),
      ]);
      sendAccountJson(response, 200, login.session);
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
  async function vaultPost(
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> {
    const token = cookies.read(request, 'session');
    await options.service.authorize(token, request.headers['x-hash-talk-csrf']);
    const session = await options.service.session(token);
    if (request.url === '/api/account/vault/upload')
      await options.vault?.preflight(
        session,
        request.headers['x-0xdmme-vault-id'],
      );
    const input = await body(request);
    sendAccountJson(
      response,
      200,
      await options.vault?.operate(
        request.url?.slice('/api/account/vault/'.length) ?? '',
        session,
        input,
      ),
    );
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
    sendAccountJson(
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
  async function sessionPost(
    request: IncomingMessage,
    response: ServerResponse,
    sessionToken: string,
  ): Promise<boolean> {
    if (request.url === '/api/account/logout') {
      await options.service.logout(sessionToken);
      response.setHeader('Set-Cookie', cookies.write('session', '', 0));
      sendAccountJson(response, 200, { status: 'signed-out' });
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
    if (await sessionPost(request, response, sessionToken)) return;
    if (await recovery.openingPost(request, response, sessionToken, input))
      return;
    if (await socialPost(request, response, sessionToken, input)) return;
    if (await calls.post(request, response, sessionToken, input)) return;
    if (await contactPost(request, response, sessionToken, input)) return;
    if (await recovery.privatePost(request, response, sessionToken, input))
      return;
    if (await enrollments.post(request, response, sessionToken, input)) return;
    if (request.url === '/api/account/name') {
      sendAccountJson(
        response,
        200,
        await options.service.rename(sessionToken, input),
      );
      return;
    }
    if (request.url === '/api/account/profile') {
      await options.service.saveProfile(sessionToken, input);
      sendAccountJson(response, 200, { status: 'saved' });
      return;
    }
    throw new AccountError(404, 'Operation not found.');
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
    sendAccountJson(
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
    sendAccountJson(
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

  function admit(request: IncomingMessage): void {
    const challenge =
      challengeRoutes.has(request.url ?? '') || approvalEntryUrl(request.url);
    if (challenge)
      limit.admit(
        clientAddress({
          request,
          trustUnixProxy: options.trustUnixProxy === true,
        }),
        true,
      );
  }
  async function handle(
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> {
    try {
      admit(request);
      if (request.method === 'POST') {
        await post(request, response);
        return;
      }
      await get(request, response);
    } catch (error: unknown) {
      if (error instanceof AccountError) {
        sendAccountJson(response, error.status, { error: error.message });
        return;
      }
      sendAccountJson(response, 503, {
        error: 'Account unavailable. Try again.',
      });
    }
  }
  /** Public, unauthenticated client settings. */
  function publicConfiguration() {
    const gifSearch = options.gifSearchKey
      ? { provider: 'klipy', key: options.gifSearchKey }
      : null;
    return {
      walletConnection: 'native',
      ecosystems: ['evm', 'solana'],
      gifSearch,
    };
  }
  async function get(
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> {
    if (request.method !== 'GET')
      throw new AccountError(405, 'Invalid method.');
    if (await approvalGet(request, response)) return;
    if (await recovery.get(request, response)) return;
    if (request.url === '/api/account/config') {
      sendAccountJson(response, 200, publicConfiguration());
      return;
    }

    const sessionToken = cookies.read(request, 'session');
    if (await notificationsGet(request, response, sessionToken)) return;
    if (request.url === '/api/account/session') {
      sendAccountJson(
        response,
        200,
        await options.service.session(sessionToken),
      );
      return;
    }
    if (request.url === '/api/account/profile') {
      sendAccountJson(
        response,
        200,
        await options.service.profile(sessionToken),
      );
      return;
    }
    throw new AccountError(404, 'Operation not found.');
  }
  async function notificationsGet(
    request: IncomingMessage,
    response: ServerResponse,
    token: string,
  ): Promise<boolean> {
    if (request.url === '/api/account/push-check' && options.notifications) {
      sendAccountJson(
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
        throw new AccountError(403, 'Entry requires document navigation.');
      if (approvalDocumentUrl(request.url))
        await approval.document(request, response);
      else await approval.enter(request, response);
      return true;
    }
    if (request.url === '/api/account/approval-request') {
      sendAccountJson(response, 200, await approval.restore(request));
      return true;
    }
    return false;
  }
  return {
    handle,
    close: () => {
      messages.close();
      calls.close();
      limit.close();
      recovery.close();
      enrollments.close();
    },
  };
}
