import { keys, object, uuid } from '../account/index.ts';
export type PrivatePushCandidate =
  | { kind: 'direct'; id: string; peer: string }
  | { kind: 'group'; id: string; group: string };
export function privatePushCandidates(value: unknown): PrivatePushCandidate[] {
  if (!Array.isArray(value) || value.length > 2)
    throw new Error('Invalid private push candidates.');
  return value.map((input) => {
    const row = object(input);
    if (row['kind'] === 'direct') {
      keys(row, ['kind', 'id', 'peer']);
      return { kind: 'direct', id: uuid(row['id']), peer: uuid(row['peer']) };
    }
    keys(row, ['kind', 'id', 'group']);
    if (row['kind'] !== 'group') throw new Error('Invalid private push kind.');
    return { kind: 'group', id: uuid(row['id']), group: uuid(row['group']) };
  });
}
