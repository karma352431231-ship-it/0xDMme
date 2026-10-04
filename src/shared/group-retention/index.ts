import { AccountError, uuid } from '../account/index.ts';
import { fileLimit, thumbnailLimit } from '../attachments/index.ts';
import { integer } from '../vault/index.ts';
import {
  groupMediaQuota,
  groupMediaTarget,
  groupMediaWarning,
} from '../group-quota/index.ts';

export const groupCleanupNotice = 24 * 60 * 60 * 1000;
export const groupCleanupBatch = 64;
export interface CleanupMedia {
  id: string;
  sequence: number;
  bytes: number;
}

/** A single media object may own its encrypted thumbnail too. Text/control bytes never enter this selection. */
function cleanupMedia(input: CleanupMedia): CleanupMedia {
  const item = {
    id: uuid(input.id),
    sequence: integer(input.sequence, Number.MAX_SAFE_INTEGER),
    bytes: integer(input.bytes, fileLimit + thumbnailLimit),
  };
  if (!item.sequence || !item.bytes)
    throw new AccountError(400, 'Objeto de limpeza inválido.');
  return item;
}

export function mediaCleanupRequired(mediaBytes: number): number {
  const bytes = integer(mediaBytes, groupMediaQuota);
  return bytes >= groupMediaWarning ? bytes - groupMediaTarget : 0;
}

/** Internal pagination bound, not a cap on group history or the final frozen selection. */
export function selectMediaCleanupBatch(input: {
  remainingBytes: number;
  after: number;
  items: readonly CleanupMedia[];
}): { selected: CleanupMedia[]; remainingBytes: number; after: number } {
  let remainingBytes = integer(input.remainingBytes, groupMediaQuota);
  let after = integer(input.after, Number.MAX_SAFE_INTEGER);
  if (input.items.length > groupCleanupBatch)
    throw new AccountError(400, 'Lote de limpeza excedido.');
  const selected: CleanupMedia[] = [];
  const ids = new Set<string>();
  for (const raw of input.items) {
    const item = cleanupMedia(raw);
    if (item.sequence <= after || ids.has(item.id))
      throw new AccountError(
        400,
        'Seleção de limpeza repetida ou fora de ordem.',
      );
    ids.add(item.id);
    after = item.sequence;
    if (!remainingBytes) continue;
    selected.push(item);
    remainingBytes = Math.max(0, remainingBytes - item.bytes);
  }
  return { selected, remainingBytes, after };
}

/** The 24-hour clock starts only once the entire selection has been frozen. */
export function mediaCleanupDueAt(frozenAt: number): number {
  const time = integer(frozenAt, Number.MAX_SAFE_INTEGER - groupCleanupNotice);
  return time + groupCleanupNotice;
}

export function mediaCleanupDue(input: {
  dueAt: number;
  now: number;
}): boolean {
  const dueAt = integer(input.dueAt, Number.MAX_SAFE_INTEGER);
  const now = integer(input.now, Number.MAX_SAFE_INTEGER);
  return now >= dueAt;
}
