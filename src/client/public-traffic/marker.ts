const lifetime = 7 * 86_400_000;
const key = '0xdmme:public-visitor:v1';

/** Absolute expiry, independent of every account and per-post browser mark. */
export function publicVisitorMarker(
  storage: Pick<Storage, 'getItem' | 'setItem'>,
  now: number,
  random: () => string = () => crypto.randomUUID().replaceAll('-', ''),
): string | null {
  try {
    const saved = storage.getItem(key);
    if (saved) {
      const parsed = stored(saved);
      if (valid(parsed, now)) return parsed.value;
    }
    const value = random();
    storage.setItem(key, JSON.stringify({ value, expires: now + lifetime }));
    return value;
  } catch {
    // Page views remain observable; visitors cannot be deduplicated reliably.
    return null;
  }
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
