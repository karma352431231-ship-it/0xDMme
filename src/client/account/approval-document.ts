import {
  approvalDocumentId,
  approvalDocumentUrl,
} from '../../shared/wallet-approval/index.ts';
import { approvalHistoryMarker } from './approval-diagnostics.ts';
import { serverApproval } from './server-approval.ts';

/** Consume the request delivered in the document before any routing or RPC. */
export function takeApprovalDocument(
  remember: (state: NonNullable<ReturnType<typeof serverApproval>>) => void,
) {
  const node = document.getElementById(approvalDocumentId);
  try {
    const payload = node?.textContent;
    if (!payload || payload.length > 1024)
      throw new Error('Pedido de aprovação ausente ou excedido.');
    const state = serverApproval(JSON.parse(payload) as unknown);
    if (!state || state.request.wallet !== 'Backpack')
      throw new Error('Pedido de aprovação inválido.');
    remember(state);
    return state;
  } finally {
    node?.remove();
    // The server already scrubbed the ticket. Never notify the wallet's
    // native navigation observer or depend on tab storage to keep this page.
    if (!approvalDocumentUrl(location.pathname))
      history.replaceState(
        approvalHistoryMarker(),
        '',
        '/wallet.html#configuracoes',
      );
  }
}
