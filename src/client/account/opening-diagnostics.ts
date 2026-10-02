import { approvalPathRequest } from '../../shared/wallet-approval/index.ts';

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
    if (!outer.pathname.startsWith(prefix))
      throw new Error('Rota desconhecida.');
    return `D2 · protocolo=doc-3 · plataforma=${agent} · ${targetSummary(target)} · ref=${outer.searchParams.has('ref') ? 'presente' : 'ausente'}`;
  } catch {
    return `D2 · protocolo=doc-3 · plataforma=${agent} · destino=invalido`;
  }
}

function targetSummary(target: URL): string {
  const path = approvalPathRequest(target.pathname);
  if (path)
    return `destino=entrada-caminho · modo=documento · pedido=presente · rede=${path.ecosystem}`;
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
  return `destino=${route} · modo=${mode} · pedido=${request} · rede=${network === 'evm' || network === 'solana' ? network : 'outra'}`;
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
