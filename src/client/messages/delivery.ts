import { object } from '../../shared/account/index.ts';
import {
  isSyncSnapshot,
  messageDeliveryBatchSize,
  messageSyncDeliveryBatchSize,
} from '../../shared/message-sync/index.ts';
import { ApiResponseError } from '../api-response/index.ts';
import { messageStates } from '../message-state/index.ts';

export interface DeliveryView {
  id: string;
  hash: string;
  state: string;
  own: boolean;
  archived?: boolean;
}
interface DeliveryState {
  hash: string;
  received: boolean;
}
type DeliveryApi = (
  operation: string,
  data: Record<string, unknown>,
) => Promise<unknown>;

/** The caller owns the authenticated authority and final snapshot check. */
interface DeliveryRead<T extends DeliveryView> {
  api: DeliveryApi;
  snapshot: unknown;
  views: readonly T[];
}

/** The finite history reader can refresh current delivery in fewer requests.
 * An older server rejects oversized batches before reading. Authorization,
 * transport and snapshot errors still propagate to the history owner. */
export async function readHistoryDelivery<T extends DeliveryView>(
  input: DeliveryRead<T>,
): Promise<T[]> {
  const online = input.views.filter((view) => !view.archived);
  if (
    !isSyncSnapshot(input.snapshot) ||
    online.length <= messageDeliveryBatchSize
  )
    return readDeliveryBatches(input, online, messageDeliveryBatchSize);
  try {
    return await readDeliveryBatches(
      input,
      online,
      messageSyncDeliveryBatchSize,
    );
  } catch (error: unknown) {
    if (!legacyBatchLimit(error)) throw error;
    return readDeliveryBatches(input, online, messageDeliveryBatchSize);
  }
}

export function readDelivery<T extends DeliveryView>(
  input: DeliveryRead<T>,
): Promise<T[]> {
  return readDeliveryBatches(
    input,
    input.views.filter((view) => !view.archived),
    messageDeliveryBatchSize,
  );
}

function legacyBatchLimit(error: unknown): boolean {
  return (
    error instanceof ApiResponseError &&
    error.operation === 'messages/delivery' &&
    error.status === 400 &&
    error.failure === 'http' &&
    error.reason === 'Invalid batch.'
  );
}

async function readDeliveryBatches<T extends DeliveryView>(
  input: DeliveryRead<T>,
  online: readonly T[],
  batchSize: number,
): Promise<T[]> {
  const states = new Map<string, DeliveryState>();
  for (let offset = 0; offset < online.length; offset += batchSize) {
    const raw = await input.api('delivery', {
      snapshot: input.snapshot,
      ids: online.slice(offset, offset + batchSize).map((view) => view.id),
    });
    if (!Array.isArray(raw)) throw new Error('Invalid delivery state.');
    const values: unknown[] = raw;
    for (const value of values) {
      const row = object(value);
      if (
        typeof row['queue_active'] !== 'boolean' ||
        typeof row['recipient_received'] !== 'boolean'
      )
        throw new Error('Invalid delivery state.');
      states.set(String(row['id']), {
        hash: String(row['hash']),
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
    throw new Error('Delivery state does not match.');
  if (view.state === messageStates.suspended) return view;
  // A verified incoming copy is already on this device. Other device queues
  // do not undo either that fact or a recipient's first confirmed receipt.
  const received = !view.own || state.received;
  return {
    ...view,
    delivery: received ? ('received' as const) : ('accepted' as const),
    state: received ? messageStates.received : messageStates.accepted,
  };
}
