import type { IncomingMessage, ServerResponse } from 'node:http';
import { AccountError, object } from '../../shared/account/index.ts';
import type { AccountService } from './service.ts';
import { AccountHttpCookies } from './http-cookies.ts';
import { sendAccountJson } from './http-response.ts';
import { keys } from '../../shared/account/index.ts';
import { RecoveryReturn } from '../recovery-return/index.ts';
import type { DeviceService } from '../devices/index.ts';
import { recoveryEntry } from '../../shared/wallet-recovery/index.ts';
import { challengeSeconds, sessionSeconds } from './service.ts';
type RecoveryAccount = Pick<
  AccountService,
  | 'session'
  | 'startHandoff'
  | 'handoffChallenge'
  | 'signHandoff'
  | 'prepareOpening'
  | 'cancelHandoff'
  | 'finishHandoff'
  | 'handoffStatus'
  | 'opening'
>;
interface RecoveryHttpOptions {
  service: RecoveryAccount;
  origin: () => string;
  devices: Pick<DeviceService, 'openingRecovery'> | undefined;
  recoveryDocument: Uint8Array | undefined;
}
/** Owns recovery return HTTP state, wallet handoff and their complete cleanup. */
export class AccountRecoveryHttp {
  private readonly options: RecoveryHttpOptions;
  private readonly cookies: AccountHttpCookies;
  private readonly recovery: RecoveryReturn;
  constructor(options: RecoveryHttpOptions, cookies: AccountHttpCookies) {
    this.options = options;
    this.cookies = cookies;
    this.recovery = new RecoveryReturn(options.origin());
  }
  async post(
    request: IncomingMessage,
    response: ServerResponse,
    input: unknown,
  ): Promise<boolean> {
    if (this.publicRecoveryPost(request, response, input)) return true;
    if (!request.url?.startsWith('/api/account/handoff-')) return false;
    await this.handoffPost(request, response, input);
    return true;
  }
  async privatePost(
    request: IncomingMessage,
    response: ServerResponse,
    sessionToken: string,
    input: unknown,
  ): Promise<boolean> {
    if (!request.url?.startsWith('/api/account/recovery-')) return false;
    await this.privateRecoveryPost(request, response, sessionToken, input);
    return true;
  }
  async openingPost(
    request: IncomingMessage,
    response: ServerResponse,
    sessionToken: string,
    input: unknown,
  ): Promise<boolean> {
    if (
      request.url === '/api/account/opening-read' ||
      request.url === '/api/account/opening-ack'
    ) {
      const session = await this.options.service.session(sessionToken);
      if (request.url.endsWith('/opening-read'))
        sendAccountJson(
          response,
          200,
          this.options.service.opening.read(session, input),
        );
      else {
        this.options.service.opening.acknowledge(session, input);
        sendAccountJson(response, 200, { status: 'acknowledged' });
      }
      return true;
    }
    return false;
  }
  async get(
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<boolean> {
    if (this.recoveryGet(request, response)) return true;
    if (request.url === '/api/account/handoff-status') {
      const state = await this.options.service.handoffStatus(
        this.cookies.read(request, 'return'),
      );
      sendAccountJson(
        response,
        200,
        state && { ...state, serverTime: new Date().toISOString() },
      );
      return true;
    }
    return false;
  }
  private publicRecoveryPost(
    request: IncomingMessage,
    response: ServerResponse,
    input: unknown,
  ): boolean {
    if (
      request.url !== '/api/account/recovery-request' &&
      request.url !== '/api/account/recovery-submit'
    )
      return false;
    sendAccountJson(
      response,
      200,
      request.url.endsWith('request')
        ? this.recovery.requestPublic(input)
        : this.recovery.submit(input),
    );
    return true;
  }
  private async handoffPost(
    request: IncomingMessage,
    response: ServerResponse,
    input: unknown,
  ): Promise<void> {
    const browserToken = this.cookies.read(request, 'return');
    if (request.url === '/api/account/handoff-start') {
      const handoff = await this.options.service.startHandoff(
        input,
        browserToken,
      );
      response.setHeader(
        'Set-Cookie',
        this.cookies.write('return', handoff.browserToken, challengeSeconds),
      );
      sendAccountJson(response, 200, {
        ticket: handoff.ticket,
        expiresAt: handoff.expiresAt,
        serverTime: new Date().toISOString(),
      });
      return;
    }
    if (request.url === '/api/account/handoff-challenge') {
      const challenge = await this.options.service.handoffChallenge(input);
      response.setHeader(
        'Set-Cookie',
        this.cookies.write(
          'challenge',
          challenge.browserToken,
          challengeSeconds,
        ),
      );
      sendAccountJson(response, 200, {
        id: challenge.id,
        message: challenge.message,
        expiresAt: challenge.expiresAt,
      });
      return;
    }
    if (request.url === '/api/account/handoff-sign') {
      const signed = await this.options.service.signHandoff(
        input,
        this.cookies.read(request, 'challenge'),
      );
      const opening = await this.options.service.prepareOpening(
        signed,
        (accountId) =>
          this.options.devices
            ? this.options.devices.openingRecovery(accountId)
            : Promise.reject(
                new AccountError(503, 'Account opening unavailable.'),
              ),
      );
      response.setHeader('Set-Cookie', this.cookies.write('challenge', '', 0));
      sendAccountJson(response, 200, {
        status: 'signed',
        origin: this.options.origin(),
        ...(opening ? { opening } : {}),
      });
      return;
    }
    if (request.url === '/api/account/handoff-opening-submit') {
      await this.options.service.opening.submit(input);
      sendAccountJson(response, 200, { status: 'encrypted' });
      return;
    }
    if (request.url === '/api/account/handoff-cancel') {
      keys(object(input), []);
      await this.options.service.cancelHandoff(browserToken);
      response.setHeader('Set-Cookie', this.cookies.write('return', '', 0));
      sendAccountJson(response, 200, { status: 'cancelled' });
      return;
    }
    if (request.url === '/api/account/handoff-confirm') {
      const login = await this.options.service.finishHandoff(
        input,
        browserToken,
        this.cookies.read(request, 'session'),
      );
      response.setHeader('Set-Cookie', [
        this.cookies.write('session', login.sessionToken, sessionSeconds),
        this.cookies.write('return', '', 0),
      ]);
      sendAccountJson(response, 200, login.session);
      return;
    }
    throw new AccountError(404, 'Operation not found.');
  }
  private async privateRecoveryPost(
    request: IncomingMessage,
    response: ServerResponse,
    sessionToken: string,
    input: unknown,
  ): Promise<void> {
    const session = await this.options.service.session(sessionToken);
    let result: unknown;
    switch (request.url) {
      case '/api/account/recovery-start':
        result = await this.recovery.start(session, input);
        break;
      case '/api/account/recovery-take':
        result = this.recovery.take(session, input);
        break;
      case '/api/account/recovery-cancel':
        result = this.recovery.cancel(session, input);
        break;
      default:
        throw new AccountError(404, 'Operation not found.');
    }
    sendAccountJson(response, 200, result);
  }
  private recoveryGet(
    request: IncomingMessage,
    response: ServerResponse,
  ): boolean {
    const entry = recoveryEntry(request.url);
    if (!entry) return false;
    if (
      request.headers['sec-fetch-mode'] !== 'navigate' ||
      request.headers['sec-fetch-dest'] !== 'document'
    )
      throw new AccountError(403, 'Entry requires document navigation.');
    let rejected = false;
    try {
      this.recovery.requestPublic(entry);
    } catch (error: unknown) {
      if (!(error instanceof AccountError) || error.status !== 409) throw error;
      rejected = true;
    }
    let document = this.options.recoveryDocument;
    if (!document || document.length > 65_536)
      throw new AccountError(503, 'Recovery page unavailable.');
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
  close(): void {
    this.recovery.close();
    this.options.service.opening.close();
  }
}
