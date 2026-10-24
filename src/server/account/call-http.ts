import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AccountService } from './service.ts';
import { sendAccountJson } from './http-response.ts';
import type { CallService } from '../calls/index.ts';
import { AccountRateLimit } from './rate-limit.ts';
export function callBodyLimit(url: string): number {
  return url.endsWith('/offer') ? 365_000 : 16_000;
}
interface CallHttpOptions {
  service: Pick<AccountService, 'session'>;
  calls: CallService | undefined;
}
/** Authenticated command budgets belong to calls; sync/end retain their exemption. */
export class AccountCallHttp {
  private readonly options: CallHttpOptions;
  private readonly sessions = new AccountRateLimit();
  constructor(options: CallHttpOptions) {
    this.options = options;
  }
  async post(
    request: IncomingMessage,
    response: ServerResponse,
    token: string,
    input: unknown,
  ): Promise<boolean> {
    if (!request.url?.startsWith('/api/account/calls/') || !this.options.calls)
      return false;
    const session = await this.options.service.session(token);
    this.sessions.admit(
      session.csrf,
      false,
      request.url.endsWith('/sync') || request.url.endsWith('/end'),
    );
    sendAccountJson(
      response,
      200,
      await this.options.calls.operate(
        request.url.slice('/api/account/calls/'.length),
        session,
        input,
        { invitation: request.headers['x-0xdmme-call-invite'] === '1' },
      ),
    );
    return true;
  }
  close(): void {
    this.options.calls?.close();
    this.sessions.close();
  }
}
