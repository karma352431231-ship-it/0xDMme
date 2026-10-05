import { AccountError, object } from '../../shared/account/index.ts';
import { prepareMessageRequest } from '../message-api/index.ts';
import type { VaultAccess } from '../vault-authority/index.ts';
/** Serial requests avoid out-of-order replay counters. Nothing is stored locally. */
export class CallTransport {
  private readonly access: VaultAccess;
  private channel = crypto.randomUUID();
  private sequence = 0;
  private generation = 0;
  private pending: Promise<unknown> = Promise.resolve();
  constructor(access: VaultAccess) {
    this.access = access;
  }
  reset(): void {
    this.generation++;
    this.channel = crypto.randomUUID();
    this.sequence = 0;
  }
  request(
    operation: string,
    payload: Record<string, unknown>,
  ): Promise<unknown> {
    const generation = this.generation;
    const work = () => this.send(operation, payload, generation);
    const result = this.pending.then(work, work);
    this.pending = result.catch(() => undefined);
    return result;
  }
  private guard(g: number): void {
    if (g !== this.generation) throw new Error('Sessão da chamada encerrada.');
  }
  private async send(
    op: string,
    payload: Record<string, unknown>,
    g: number,
  ): Promise<unknown> {
    this.guard(g);
    const options = await this.access.withVault(false, (a) => {
      this.guard(g);
      return prepareMessageRequest(
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
    });
    this.guard(g);
    const response = await fetch(`/api/account/calls/${op}`, {
      ...options,
      signal: AbortSignal.timeout(5000),
    });
    const data: unknown = await response.json();
    this.guard(g);
    if (!response.ok)
      throw new AccountError(
        response.status,
        String(object(data)['error']).slice(0, 200),
      );
    return data;
  }
}
