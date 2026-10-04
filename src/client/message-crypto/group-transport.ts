import { object } from '../../shared/account/index.ts';
import { groupDeviceBatchSize } from '../../shared/group-messages/index.ts';
import type { MessageTransport } from './transport.ts';

function completeResponse(input: unknown): Record<string, unknown> {
  const response = object(input);
  if (Object.keys(object(response['failures'] ?? {})).length)
    throw new Error(
      'Consulta de chaves de grupo incompleta. Retome o envio após atualizar.',
    );
  return response;
}

function deviceBatches(
  value: unknown,
): Record<string, Record<string, unknown>>[] {
  const devices = Object.entries(object(value)).flatMap(([user, values]) =>
    Object.entries(object(values)).map(([device, content]) => ({
      user,
      device,
      content,
    })),
  );
  const batches: Record<string, Record<string, unknown>>[] = [];
  for (
    let offset = 0;
    offset < devices.length;
    offset += groupDeviceBatchSize
  ) {
    const batch: Record<string, Record<string, unknown>> = {};
    for (const item of devices.slice(offset, offset + groupDeviceBatchSize)) {
      const userDevices = (batch[item.user] ??= {});
      userDevices[item.device] = item.content;
    }
    batches.push(batch);
  }
  return batches;
}

async function query(
  transport: MessageTransport,
  payload: Record<string, unknown>,
): Promise<unknown> {
  const sdk = object(payload['sdk']),
    entries = Object.entries(object(sdk['device_keys']));
  const deviceKeys: Record<string, unknown> = {},
    bindings: unknown[] = [];
  for (let offset = 0; offset < entries.length; offset += 16) {
    const result = object(
      await transport('matrix-query', {
        ...payload,
        sdk: {
          ...sdk,
          device_keys: Object.fromEntries(entries.slice(offset, offset + 16)),
        },
      }),
    );
    const response = completeResponse(result['response']);
    if (!Array.isArray(result['bindings']))
      throw new Error('Vínculos de grupo ausentes.');
    Object.assign(deviceKeys, object(response['device_keys']));
    bindings.push(...(result['bindings'] as unknown[]));
  }
  return { bindings, response: { device_keys: deviceKeys, failures: {} } };
}

async function claim(
  transport: MessageTransport,
  payload: Record<string, unknown>,
): Promise<unknown> {
  const sdk = object(payload['sdk']),
    keys: Record<string, Record<string, unknown>> = {};
  for (const batch of deviceBatches(sdk['one_time_keys'])) {
    const result = object(
      await transport('matrix-claim', {
        ...payload,
        sdk: { ...sdk, one_time_keys: batch },
      }),
    );
    for (const [user, devices] of Object.entries(
      object(completeResponse(result['response'])['one_time_keys']),
    )) {
      const userKeys = (keys[user] ??= {});
      Object.assign(userKeys, object(devices));
    }
  }
  return { response: { one_time_keys: keys, failures: {} } };
}

/** Complete SDK membership is preserved; HTTP pages bound the work, never the member count. */
export function groupTransport(transport: MessageTransport): MessageTransport {
  return async (operation, payload) => {
    if (operation === 'matrix-query') return query(transport, payload);
    if (operation === 'matrix-claim') return claim(transport, payload);
    if (operation !== 'matrix-send') return transport(operation, payload);
    const sdk = object(payload['sdk']);
    for (const messages of deviceBatches(sdk['messages']))
      await transport(operation, { ...payload, sdk: { messages } });
    return { response: {} };
  };
}
