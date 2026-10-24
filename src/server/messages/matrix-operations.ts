import {
  AccountError,
  keys,
  object,
  uuid,
} from '../../shared/account/index.ts';
import { fingerprint, directoryEvent } from '../../shared/devices/index.ts';
import type {
  ContactAuthority,
  Database,
  DeviceStore,
} from '../database/index.ts';
import type { MessageAction } from './operation.ts';
import { messageSequence as sequence } from './operation-input.ts';
import { verifyMatrixBinding } from '../../shared/messages/index.ts';
import {
  assertBindingAccount,
  matrixClaim,
  matrixQuery,
  matrixSend,
  matrixUpload,
  groupMatrixQuery,
  groupMatrixClaim,
  groupMatrixSend,
} from '../matrix-protocol/index.ts';
interface MatrixMessagePorts {
  store: Database['matrix'];
  devices: Pick<DeviceStore, 'current'>;
}
/** Matrix transport keeps direct/group validation and current-device binding. */
export function matrixMessageOperations(
  input: MatrixMessagePorts,
): Record<string, MessageAction> {
  return {
    'matrix-upload': (a, d) => uploadMatrix(input, a, d),
    'matrix-query': async (a, d) => input.store.query(a, matrixQuery(d)),
    'matrix-claim': async (a, d) => ({
      response: await input.store.claim(a, matrixClaim(d)),
    }),
    'matrix-send': async (a, d) => {
      const value = matrixSend(d);
      return { response: await input.store.send(a, value.id, value.envelopes) };
    },
    'matrix-inbox': (a, d) => {
      keys(d, []);
      return input.store.inbox(a);
    },
    'matrix-received': (a, d) => {
      keys(d, ['sequences']);
      const values = d['sequences'];
      if (!Array.isArray(values) || values.length > 16)
        throw new AccountError(400, 'Invalid batch.');
      return input.store.received(a, values.map(sequence));
    },
    'group-matrix-query': (a, d) => {
      const { scope, payload } = groupMatrixInput(d);
      return input.store.groupQuery(a, {
        ...scope,
        accounts: groupMatrixQuery(payload),
      });
    },
    'group-matrix-claim': async (a, d) => {
      const { scope, payload } = groupMatrixInput(d);
      return {
        response: await input.store.groupClaim(a, {
          ...scope,
          requests: groupMatrixClaim(payload),
        }),
      };
    },
    'group-matrix-send': async (a, d) => {
      const { scope, payload } = groupMatrixInput(d);
      return {
        response: await input.store.groupSend(a, {
          ...scope,
          ...groupMatrixSend(payload),
        }),
      };
    },
    'group-matrix-inbox': (a, d) => {
      keys(d, ['after']);
      return input.store.groupInbox(a, sequence(d['after']));
    },
    'group-matrix-received': (a, d) => {
      keys(d, ['sequences']);
      const values = d['sequences'];
      if (!Array.isArray(values) || values.length > 16)
        throw new AccountError(400, 'Invalid batch.');
      return input.store.groupReceived(a, values.map(sequence));
    },
  };
}
async function uploadMatrix(
  input: MatrixMessagePorts,
  a: ContactAuthority,
  d: Record<string, unknown>,
): Promise<unknown> {
  const value = matrixUpload(d),
    current = await input.devices.current(a.session.accountId);
  if (!current) throw new AccountError(403, 'Directory missing.');
  assertBindingAccount(value.binding, a.session.accountId, a.session.deviceId);
  await verifyMatrixBinding(value.binding, directoryEvent(current.event));
  return { response: await input.store.upload(a, value) };
}
function groupMatrixInput(data: Record<string, unknown>): {
  scope: { groupId: string; head: string };
  payload: Record<string, unknown>;
} {
  keys(data, ['groupId', 'head', 'payload']);
  return {
    scope: { groupId: uuid(data['groupId']), head: fingerprint(data['head']) },
    payload: object(data['payload']),
  };
}
