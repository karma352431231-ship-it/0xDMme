import { Resolver } from 'node:dns/promises';
import { AccountError } from '../../shared/account/index.ts';
import { domainName } from '../../shared/representatives/index.ts';
export interface DomainResolver {
  matches(domain: string, record: string): Promise<boolean>;
}
/** Uses the host DNS resolver, without HTTP fetches, provider credentials or client IP. */
export class DnsDomainResolver implements DomainResolver {
  private active = 0;
  async matches(domain: string, record: string): Promise<boolean> {
    if (this.active >= 2)
      throw new AccountError(
        429,
        'Verificação de domínio ocupada. Tente novamente.',
      );
    const name = `_0xdmme.${domainName(domain)}`;
    const resolver = new Resolver({ timeout: 2000, tries: 1 });
    this.active++;
    const timer = setTimeout(() => resolver.cancel(), 4000);
    timer.unref();
    try {
      const records = await resolver.resolveTxt(name);
      if (
        records.length > 32 ||
        records.flat().reduce((n, v) => n + v.length, 0) > 16_384
      )
        throw new Error('Resposta DNS excedida.');
      return records.some((chunks) => chunks.join('') === record);
    } catch (error: unknown) {
      if (
        error instanceof Error &&
        'code' in error &&
        ['ENODATA', 'ENOTFOUND'].includes(String(error.code))
      )
        return false;
      throw new AccountError(503, 'Não foi possível confirmar o DNS agora.');
    } finally {
      clearTimeout(timer);
      this.active--;
    }
  }
}
