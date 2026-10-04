import { object } from '../../shared/account/index.ts';
import { recoveryKey } from '../../shared/messages/index.ts';
import type { RecoveryKey } from '../../shared/messages/index.ts';
/** Treat export responses as untrusted until each packet is checked against its signed index. */
export function readBackupWindow(value: unknown, ids: readonly string[]) {
  const response = object(value),
    raw = response['rows'],
    recovery = response['recovery'];
  if (
    !Array.isArray(raw) ||
    !raw.length ||
    raw.length > ids.length ||
    !Array.isArray(recovery) ||
    recovery.length > 32
  )
    throw new Error('Lote de backup inválido.');
  const keys = new Map<string, RecoveryKey>(),
    packets = new Map<string, unknown>();
  for (const value of recovery) {
    const key = recoveryKey(value);
    if (keys.has(key.id)) throw new Error('Chave duplicada.');
    keys.set(key.id, key);
  }
  for (let i = 0; i < raw.length; i++) {
    const row = readRow(raw[i], ids[i]!);
    if (row['unavailable'] === undefined) packets.set(ids[i]!, row['packet']);
  }
  return { keys, packets, count: raw.length };
}

function readRow(value: unknown, id: string): Record<string, unknown> {
  const row = object(value);
  if (row['id'] !== id) throw new Error('Ordem do backup divergente.');
  if (
    row['unavailable'] !== undefined &&
    (![410, 423].includes(Number(row['unavailable'])) ||
      row['packet'] !== undefined)
  )
    throw new Error('Falha de backup inválida.');
  return row;
}
