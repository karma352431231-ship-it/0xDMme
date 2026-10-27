import type { IncomingMessage, ServerResponse } from 'node:http';
import { AccountError, object } from '../../shared/account/index.ts';
import type { AccountService } from './service.ts';
import { AccountHttpCookies } from './http-cookies.ts';
import { sendAccountJson } from './http-response.ts';
import type { MessageService } from '../messages/index.ts';
import type { MessageLive } from '../message-live/index.ts';
import { readAccountBody } from './http-body.ts';
const messageBodyBudgets = new Map<string, number>([
  // Thirty-two signed ID/hash receipts exceed the default 4 KiB envelope.
  ['backup-ack', 8192],
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
export function messageBodyLimit(url: string): number {
  return messageBodyBudgets.get(url.slice(url.lastIndexOf('/') + 1)) ?? 4096;
}
interface MessageHttpOptions {
  service: Pick<AccountService, 'authorize' | 'session'>;
  messages: MessageService | undefined;
  live: MessageLive | undefined;
}
/** Owns upload preflight, signed message dispatch and live-stream authorization. */
export class AccountMessageHttp {
  private readonly options: MessageHttpOptions;
  private readonly cookies: AccountHttpCookies;
  constructor(options: MessageHttpOptions, cookies: AccountHttpCookies) {
    this.options = options;
    this.cookies = cookies;
  }
  async post(
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<boolean> {
    if (
      request.url?.startsWith('/api/account/messages/') &&
      this.options.messages
    ) {
      const token = this.cookies.read(request, 'session');
      await this.options.service.authorize(
        token,
        request.headers['x-hash-talk-csrf'],
      );
      if (request.url.endsWith('/dm-attachment-part'))
        await this.options.messages.preflightSocialAttachment(
          await this.options.service.session(token),
          request.headers['x-0xdmme-attachment-id'],
        );
      if (request.url.endsWith('/attachment-part'))
        await this.options.messages.preflightAttachment(
          await this.options.service.session(token),
          request.headers['x-0xdmme-attachment-id'],
        );
      await this.messagePost(
        request,
        response,
        token,
        await readAccountBody(request, messageBodyLimit(request.url)),
      );
      return true;
    }
    return false;
  }
  private async messagePost(
    request: IncomingMessage,
    response: ServerResponse,
    sessionToken: string,
    input: unknown,
  ): Promise<boolean> {
    if (
      request.url?.startsWith('/api/account/messages/') &&
      this.options.messages
    ) {
      if (request.url === '/api/account/messages/live' && this.options.live) {
        await this.livePost(response, sessionToken, {
          proof: input,
          callWakeups: request.headers['x-0xdmme-call-wake'] === '1',
        });
        return true;
      }
      sendAccountJson(
        response,
        200,
        await this.options.messages.operate(
          request.url.slice('/api/account/messages/'.length),
          await this.options.service.session(sessionToken),
          input,
        ),
      );
      return true;
    }
    return false;
  }
  private async livePost(
    response: ServerResponse,
    token: string,
    input: { proof: unknown; callWakeups: boolean },
  ): Promise<void> {
    const session = await this.options.service.session(token);
    const head = await this.options.messages?.operate(
      'live',
      session,
      input.proof,
    );
    if (typeof head !== 'string')
      throw new AccountError(503, 'Channel unavailable.');
    const validate = async () => {
      const [current, authorized] = await Promise.all([
        this.options.service.session(token),
        this.options.messages?.liveCurrent(session, head),
      ]);
      return (
        current.accountId === session.accountId &&
        current.deviceId === session.deviceId &&
        current.csrf === session.csrf &&
        authorized === true
      );
    };
    if (!(await validate()))
      throw new AccountError(403, 'Channel has no current authorization.');
    if (!response.destroyed)
      this.options.live?.open({
        session,
        response,
        validate,
        callWakeups: input.callWakeups,
        categories:
          object(object(input.proof)['payload'])['categories'] === true,
      });
  }
  close(): void {
    this.options.live?.close();
  }
}
