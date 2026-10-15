import { object } from '../../shared/account/index.ts';
import { messageStates } from '../message-state/index.ts';

interface DeliveryView {
  id: string;
  hash: string;
  state: string;
  archived?: boolean;
}
interface DeliveryState {
  hash: string;
  pending: boolean;
  received: boolean;
}
type DeliveryApi = (
  operation: string,
  data: Record<string, unknown>,
) => Promise<unknown>;

/** The caller owns the authenticated authority and final snapshot check. */
export async function readDelivery<T extends DeliveryView>(input: {
  api: DeliveryApi;
  snapshot: unknown;
  views: readonly T[];
}): Promise<T[]> {
  const states = new Map<string, DeliveryState>();
  const online = input.views.filter((view) => !view.archived);
  for (let offset = 0; offset < online.length; offset += 18) {
    const raw = await input.api('delivery', {
      snapshot: input.snapshot,
      ids: online.slice(offset, offset + 18).map((view) => view.id),
    });
    if (!Array.isArray(raw)) throw new Error('Estado de entrega inválido.');
    const values: unknown[] = raw;
    for (const value of values) {
      const row = object(value);
      if (
        typeof row['queue_active'] !== 'boolean' ||
        typeof row['recipient_received'] !== 'boolean'
      )
        throw new Error('Estado de entrega inválido.');
      states.set(String(row['id']), {
        hash: String(row['hash']),
        pending: row['queue_active'],
        received: row['recipient_received'],
      });
    }
  }
  return input.views.map((view) => projectDelivery(view, states));
}

function projectDelivery<T extends DeliveryView>(
  view: T,
  states: ReadonlyMap<string, DeliveryState>,
): T {
  if (view.archived) return view;
  const state = states.get(view.id);
  if (!state || state.hash !== view.hash)
    throw new Error('Estado de entrega divergente.');
  if (view.state === messageStates.suspended) return view;
  return {
    ...view,
    delivery: state.received ? ('received' as const) : ('accepted' as const),
    state: state.pending ? messageStates.accepted : messageStates.received,
  };
}
