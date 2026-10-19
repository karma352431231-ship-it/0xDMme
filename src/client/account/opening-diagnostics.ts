import { approvalPathRequest } from '../../shared/wallet-approval/index.ts';
import { t } from '../../shared/i18n/index.ts';

/** Classify a generated Backpack link without exposing any request capability. */
export function openingDiagnostics(
  link: string,
  platform: string,
): string | null {
  const prefix = '/ul/v1/browse/';
  const agent = ['android', 'ios', 'other'].includes(platform)
    ? platform
    : 'other';
  let outer: URL;
  try {
    if (link.length > 2048) return null;
    outer = new URL(link);
    if (outer.origin !== 'https://backpack.app') return null;
  } catch {
    return null;
  }
  try {
    const target = new URL(
      decodeURIComponent(outer.pathname.slice(prefix.length)),
    );
    if (!outer.pathname.startsWith(prefix)) throw new Error('Unknown route.');
    return t('D2 · protocol=doc-3 · platform={0} · {1} · ref={2}', [
      agent,
      targetSummary(target),
      outer.searchParams.has('ref') ? 'presente' : 'ausente',
    ]);
  } catch {
    return t('D2 · protocol=doc-3 · platform={0} · destination=invalid', [
      agent,
    ]);
  }
}

function targetSummary(target: URL): string {
  const path = approvalPathRequest(target.pathname);
  if (path)
    return t(
      'destination=path-entry · mode=document · request=present · network={0}',
      [path.ecosystem],
    );
  const params = target.hash.startsWith('#configuracoes?')
    ? new URLSearchParams(target.hash.slice('#configuracoes?'.length))
    : target.searchParams;
  const ticket = params.get('ticket');
  const request =
    ticket === null
      ? 'ausente'
      : /^[a-f0-9]{64}$/u.test(ticket)
        ? 'presente'
        : 'invalido';
  const network = params.get('ecosystem');
  const { route, mode } = routeMode(target);
  return t('destination={0} · mode={1} · request={2} · network={3}', [
    route,
    mode,
    request,
    network === 'evm' || network === 'solana' ? network : 'outra',
  ]);
}

function routeMode(target: URL) {
  const route =
    target.pathname === '/wallet-entry'
      ? 'entrada'
      : target.pathname === '/wallet.html'
        ? 'pagina-wallet'
        : 'outra';
  const mode =
    target.searchParams.get('view') === 'page'
      ? 'documento'
      : target.hash.startsWith('#configuracoes?')
        ? 'fragmento'
        : 'padrao';
  return { route, mode };
}
