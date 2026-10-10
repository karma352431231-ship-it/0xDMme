export type MediaScope = 'all' | 'gifs';
export interface MediaChoices {
  all: boolean | null;
  gifs: boolean | null;
}
export type ConsentStorage = Pick<Storage, 'getItem' | 'setItem'>;
const empty = (): MediaChoices => ({ all: null, gifs: null });
export function mediaStorage(): ConsentStorage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}
export function readChoices(
  storage: ConsentStorage | null,
  key: string,
): MediaChoices {
  try {
    const value: unknown = JSON.parse(storage?.getItem(key) ?? 'null');
    if (!value || typeof value !== 'object') return empty();
    const data = value as Record<string, unknown>;
    if (
      data['version'] !== 1 ||
      ![null, true, false].includes(data['all'] as boolean | null) ||
      ![null, true, false].includes(data['gifs'] as boolean | null)
    )
      return empty();
    return {
      all: data['all'] as boolean | null,
      gifs: data['gifs'] as boolean | null,
    };
  } catch {
    return empty();
  }
}
export function writeChoices(
  storage: ConsentStorage | null,
  key: string,
  choices: MediaChoices,
): boolean {
  if (!storage) return false;
  try {
    storage.setItem(key, JSON.stringify({ version: 1, ...choices }));
    return true;
  } catch {
    return false;
  }
}
