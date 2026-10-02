import { SolanaConnectionError } from '../wallet/index.ts';
import {
  approvalDocumentId,
  approvalDocumentUrl,
  approvalEntryUrl,
} from '../../shared/wallet-approval/index.ts';

export type ApprovalStage =
  | 'entrada'
  | 'pedido-ausente'
  | 'pedido-invalido'
  | 'limpeza-url-falhou'
  | 'pedido-lido'
  | 'pedido-restaurado'
  | 'pedido-cookie-solicitado'
  | 'pedido-cookie-recebido'
  | 'pedido-expirado'
  | 'conexao-solicitada'
  | 'conexao-recebida'
  | 'desafio-solicitado'
  | 'desafio-recebido'
  | 'assinatura-solicitada'
  | 'assinatura-recebida'
  | 'wallet-reconferida'
  | 'assinatura-enviada'
  | 'assinatura-confirmada'
  | 'retorno-manual';

const markerKey = 'xdmmeApprovalDiagnostic';

/** One generic history-entry marker, never an authentication capability. */
export function approvalHistoryMarker(): Record<string, number> {
  return { [markerKey]: Date.now() + 300_000 };
}

function previousFragment(): string {
  try {
    const state: unknown = history.state;
    if (typeof state !== 'object' || state === null || !(markerKey in state))
      return 'sem-marcador';
    const expires: unknown = (state as Record<string, unknown>)[markerKey];
    if (typeof expires !== 'number' || !Number.isFinite(expires))
      return 'sem-marcador';
    const remaining = expires - Date.now();
    return remaining > 0 && remaining <= 300_000
      ? 'fragmento-recebido-antes'
      : 'marcador-expirado';
  } catch {
    return 'historico-indisponivel';
  }
}

function navigationType(): string {
  try {
    if (typeof performance === 'undefined') return 'indisponivel';
    const entry = performance.getEntriesByType('navigation')[0];
    if (!entry || !('type' in entry)) return 'indisponivel';
    return ['navigate', 'reload', 'back_forward'].includes(String(entry.type))
      ? String(entry.type)
      : 'indisponivel';
  } catch {
    // Optional observation must not prevent reading an authentication request.
    return 'indisponivel';
  }
}

function inputKind(): string {
  if (
    approvalEntryUrl(location.pathname) ||
    approvalDocumentUrl(location.pathname)
  )
    return documentInputKind();
  if (!location.hash) return 'sem-fragmento';
  if (location.hash === '#configuracoes') return 'rota-sem-pedido';
  if (location.hash.startsWith('#configuracoes?')) {
    const params = new URLSearchParams(
      location.hash.slice('#configuracoes?'.length),
    );
    if (params.get('invalid') === '1') {
      if (params.get('reason') === 'parameters')
        return 'entrada-rejeitada-parametros';
      if (params.get('reason') === 'unavailable')
        return 'entrada-rejeitada-pedido';
      return 'entrada-rejeitada';
    }
  }
  return location.hash.startsWith('#configuracoes?')
    ? 'fragmento-de-pedido'
    : 'outro-fragmento';
}

function documentInputKind(): string {
  const reason = document
    .getElementById(approvalDocumentId)
    ?.getAttribute?.('data-rejected');
  if (reason === 'parameters') return 'entrada-rejeitada-parametros';
  if (reason === 'unavailable') return 'entrada-rejeitada-pedido';
  if (reason === 'missing') return 'entrada-sem-cookie';
  return 'entrada-documento';
}

export function createApprovalDiagnostics() {
  let input = inputKind();
  const navigation = navigationType();
  const previous = previousFragment();
  let source = 'inicio';
  let stage: ApprovalStage = 'entrada';
  let failure = 'nao';
  return {
    rejectionMessage(): string | null {
      if (input === 'entrada-sem-cookie')
        return 'O pedido não chegou à página de aprovação. Volte ao navegador original e crie um novo pedido.';
      if (input === 'entrada-rejeitada-parametros')
        return 'O link chegou com parâmetros inválidos ou incompletos. Volte ao navegador original e crie um novo pedido.';
      if (input === 'entrada-rejeitada-pedido')
        return 'O pedido foi recusado na entrada: pode ter expirado, sido cancelado ou já assinado, ou não corresponder ao ecossistema. Volte ao navegador original e crie um novo pedido.';
      if (input === 'entrada-rejeitada')
        return 'O pedido foi recusado na entrada. Volte ao navegador original e crie um novo pedido.';
      return null;
    },
    beginFragment() {
      source = 'novo-fragmento';
      input = inputKind();
      failure = 'nao';
      stage = 'entrada';
    },
    step(next: ApprovalStage) {
      stage = next;
      failure = 'nao';
    },
    fail(error?: number | SolanaConnectionError) {
      if (error instanceof SolanaConnectionError) {
        failure = error.category;
        return;
      }
      failure =
        error !== undefined &&
        Number.isInteger(error) &&
        error >= 400 &&
        error <= 599
          ? `HTTP-${error}`
          : 'local-ou-provider';
    },
    text(provider: boolean | null, storageAvailable = true) {
      // Fixed categories only: never stringify input, errors or provider data.
      const availability =
        provider === null ? 'nao-avaliado' : provider ? 'presente' : 'ausente';
      return `D1 · entrada=${input} · chegada=${source} · navegacao=${navigation} · historico=${previous} · etapa=${stage} · provider=${availability} · armazenamento=${storageAvailable ? 'disponivel' : 'indisponivel'} · falha=${failure} · protocolo=doc-3`;
    },
  };
}
