import { fetchApi } from '../api-response/index.ts';
import { prepareMessageRequest } from '../message-api/index.ts';
import { AccountError } from '../../shared/account/index.ts';
import type {
  VaultAccess,
  VaultWorkOptions,
} from '../vault-authority/index.ts';
import { sameLiveSession } from './session.ts';
import type { LiveSession } from './session.ts';

/** A visible page's directory refresh waits for this handshake, so its signed
 * turns precede queued maintenance; hidden pages keep maintenance priority. */
export function liveHandshakeWork(): VaultWorkOptions {
  return typeof document !== 'undefined' &&
    document.visibilityState === 'visible'
    ? { priority: 'interactive' }
    : {};
}

/** Negotiate only this read-only stream. Old servers reject the extra signed
 * payload with 400; one fresh signed legacy request preserves their protocol.
 * Authentication failures and other failures are never retried here. */
export class LiveRequest {
  private categories = true;
  async open(input: {
    access: VaultAccess;
    session: LiveSession | undefined;
    signal: AbortSignal;
    current: () => boolean;
  }): Promise<Response> {
    const response = await this.request(input);
    if (!this.categories || response.status !== 400) return response;
    await response.body?.cancel();
    this.categories = false;
    return this.request(input);
  }
  private async request(input: Parameters<LiveRequest['open']>[0]) {
    const options = await input.access.withVault(
      false,
      (a) => {
        input.signal.throwIfAborted();
        if (!input.current()) throw new DOMException('Aborted', 'AbortError');
        if (input.session && !sameLiveSession(input.session, a.session))
          throw new AccountError(401, 'Session changed.');
        return prepareMessageRequest(
          a,
          'live',
          this.categories ? { categories: true } : {},
        );
      },
      liveHandshakeWork(),
    );
    input.signal.throwIfAborted();
    if (!input.current()) throw new DOMException('Aborted', 'AbortError');
    const headers = new Headers(options.headers);
    headers.set('X-0xdmme-Call-Wake', '1');
    return fetchApi('messages/live', '/api/account/messages/live', {
      ...options,
      headers,
      signal: input.signal,
    });
  }
}
