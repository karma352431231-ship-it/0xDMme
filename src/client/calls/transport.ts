import { fetchApi, readApiJson } from '../api-response/index.ts';
import { prepareMessageRequest } from '../message-api/index.ts';
import type { SigningAuthority } from '../message-api/index.ts';
import { leaseMs } from '../../shared/calls/index.ts';
import type { VaultAccess } from '../vault-authority/index.ts';
/** Serial requests avoid out-of-order replay counters. Nothing is stored locally. */
export class CallTransport {
  private readonly access: VaultAccess;
  private signing: { authority: SigningAuthority; until: number } | null = null;
  private channel = crypto.randomUUID();
  private sequence = 0;
  private generation = 0;
  private pending: Promise<unknown> = Promise.resolve();
  constructor(access: VaultAccess) {
    this.access = access;
  }
  reset(): void {
    this.generation++;
    this.signing = null;
    this.channel = crypto.randomUUID();
    this.sequence = 0;
  }
  request(
    operation: string,
    payload: Record<string, unknown>,
  ): Promise<unknown> {
    const generation = this.generation;
    const work = async () => {
      try {
        return await this.send(operation, payload, generation);
      } catch (error: unknown) {
        if (generation === this.generation) this.signing = null;
        throw error;
      }
    };
    const result = this.pending.then(work, work);
    this.pending = result.catch(() => undefined);
    return result;
  }
  private guard(g: number): void {
    if (g !== this.generation) throw new Error('Call session ended.');
  }
  private async authority(g: number): Promise<SigningAuthority> {
    if (this.signing && Date.now() < this.signing.until)
      return this.signing.authority;
    const until = Date.now() + leaseMs;
    const authority = await this.access.withVault(
      false,
      (a) => {
        this.guard(g);
        if (a.offline)
          throw new Error('Autorização online da chamada indisponível.');
        // Retain only session-bound signing, never content/wrapping key closures.
        return Promise.resolve({
          session: { ...a.session },
          directory: a.directory,
          sign: a.sign,
        });
      },
      { priority: 'interactive' },
    );
    this.guard(g);
    if (Date.now() >= until) throw new Error('Autorização da chamada expirou.');
    this.signing = { authority, until };
    return authority;
  }
  private async send(
    op: string,
    payload: Record<string, unknown>,
    g: number,
  ): Promise<unknown> {
    this.guard(g);
    const a = await this.authority(g);
    this.guard(g);
    const options = await prepareMessageRequest(
      a,
      `call:${op}`,
      op === 'configure'
        ? payload
        : {
            ...payload,
            channel: this.channel,
            request: ++this.sequence,
            at: Date.now(),
          },
    );
    this.guard(g);
    const response = await fetchApi(`calls/${op}`, `/api/account/calls/${op}`, {
      ...options,
      headers: { ...options.headers, 'X-0xdmme-Call-Invite': '1' },
      signal: AbortSignal.timeout(5000),
    });
    let data: unknown;
    try {
      data = await readApiJson(response, `calls/${op}`);
    } catch (error: unknown) {
      this.signing = null;
      throw error;
    }
    this.guard(g);
    return data;
  }
}
