const day = 86_400_000;
/** One year, renewed by visits like common analytics markers (owner, 08/11/2026). */
const lifetime = 365 * day;
const key = '0xdmme:public-visitor:v1';

/**
 * Random public-visitor marker, independent of every account, wallet, device
 * key and per-post browser mark. A visit pushes its expiry to one year ahead,
 * rewriting storage at most once a day.
 */
export function publicVisitorMarker(
  storage: Pick<Storage, 'getItem' | 'setItem'>,
  now: number,
  random: () => string = () => crypto.randomUUID().replaceAll('-', ''),
): string | null {
  try {
    const saved = savedMarker(storage, now);
    if (saved) {
      if (saved.expires < now + lifetime - day) save(storage, saved.value, now);
      return saved.value;
    }
    const value = random();
    save(storage, value, now);
    return value;
  } catch {
    // Page views remain observable; visitors cannot be deduplicated reliably.
    return null;
  }
}

function savedMarker(
  storage: Pick<Storage, 'getItem'>,
  now: number,
): { value: string; expires: number } | null {
  const saved = storage.getItem(key);
  if (!saved) return null;
  const parsed = stored(saved);
  return valid(parsed, now) ? parsed : null;
}

function save(storage: Pick<Storage, 'setItem'>, value: string, now: number) {
  storage.setItem(key, JSON.stringify({ value, expires: now + lifetime }));
}

function stored(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function valid(
  value: unknown,
  now: number,
): value is { value: string; expires: number } {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('value' in value) ||
    !('expires' in value)
  )
    return false;
  return (
    typeof value.value === 'string' &&
    /^[a-f0-9]{32}$/u.test(value.value) &&
    typeof value.expires === 'number' &&
    Number.isSafeInteger(value.expires) &&
    value.expires > now &&
    value.expires <= now + lifetime
  );
}
