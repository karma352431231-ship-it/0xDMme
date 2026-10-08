import { object } from '../../src/shared/account/index.ts';
import { matrixUser } from '../../src/shared/messages/index.ts';
import type { MatrixBinding } from '../../src/shared/messages/index.ts';
import type { MessageTransport } from '../../src/client/message-crypto/index.ts';

function claimKeys(
  oneTime: Map<string, Record<string, unknown>>,
  devices: unknown,
): Record<string, unknown> {
  const selected: Record<string, unknown> = {};
  for (const device of Object.keys(object(devices))) {
    const available = oneTime.get(device),
      entry = Object.entries(available ?? {})[0];
    if (!entry || !available) continue;
    selected[device] = { [entry[0]]: entry[1] };
    delete available[entry[0]];
  }
  return selected;
}

/** Synthetic public SDK keys only; real SDK produces/consumes the ciphertext.
 * No network, persistence, real accounts or replacement cryptography. */
export function messageTransport() {
  const bindings = new Map<string, MatrixBinding>();
  const oneTime = new Map<string, Record<string, unknown>>();
  const queries: string[][] = [];
  const transport: MessageTransport = (operation, payload) => {
    const sdk = object(payload['sdk']);
    if (operation === 'matrix-upload') {
      const binding = payload['binding'] as MatrixBinding;
      bindings.set(matrixUser(binding.accountId), binding);
      if (sdk['one_time_keys'])
        oneTime.set(binding.deviceId, object(sdk['one_time_keys']));
      return Promise.resolve({
        response: { one_time_key_counts: { signed_curve25519: 50 } },
      });
    }
    if (operation === 'matrix-query') {
      const users = Object.keys(object(sdk['device_keys']));
      queries.push(users);
      const found = users.flatMap((user) =>
        bindings.has(user) ? [bindings.get(user)!] : [],
      );
      return Promise.resolve({
        response: {
          device_keys: Object.fromEntries(
            users.map((user) => {
              const binding = bindings.get(user);
              return [
                user,
                binding ? { [binding.deviceId]: binding.public } : {},
              ];
            }),
          ),
          failures: {},
        },
        bindings: found,
      });
    }
    if (operation === 'matrix-claim') {
      const keys: Record<string, Record<string, unknown>> = {};
      for (const [user, devices] of Object.entries(
        object(sdk['one_time_keys']),
      )) {
        keys[user] = claimKeys(oneTime, devices);
      }
      return Promise.resolve({
        response: { one_time_keys: keys, failures: {} },
      });
    }
    return Promise.resolve({ response: {} });
  };
  return { transport, queries, bindings };
}
