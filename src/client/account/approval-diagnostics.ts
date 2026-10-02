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
  if (!location.hash) return 'sem-fragmento';
  if (location.hash === '#configuracoes') return 'rota-sem-pedido';
  return location.hash.startsWith('#configuracoes?')
    ? 'fragmento-de-pedido'
    : 'outro-fragmento';
}

export function createApprovalDiagnostics() {
  let input = inputKind();
  const navigation = navigationType();
  const previous = previousFragment();
  let source = 'inicio';
  let stage: ApprovalStage = 'entrada';
  let failure = 'nao';
  return {
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
    fail(status?: number) {
      failure =
        status !== undefined &&
        Number.isInteger(status) &&
        status >= 400 &&
        status <= 599
          ? `HTTP-${status}`
          : 'local-ou-provider';
    },
    text(provider: boolean | null, storageAvailable = true) {
      // Fixed categories only: never stringify input, errors or provider data.
      const availability =
        provider === null ? 'nao-avaliado' : provider ? 'presente' : 'ausente';
      return `D1 · entrada=${input} · chegada=${source} · navegacao=${navigation} · historico=${previous} · etapa=${stage} · provider=${availability} · armazenamento=${storageAvailable ? 'disponivel' : 'indisponivel'} · falha=${failure}`;
    },
  };
}
