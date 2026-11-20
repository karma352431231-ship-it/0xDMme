/**
 * A link that may be shown as clickable: http(s) only, no credentials, no
 * spaces or control characters, bounded length. Returns the normalized href.
 */
export function webLink(value: string): string | null {
  if (value.length > 2048 || /[\s\p{Cc}\p{Cf}]/u.test(value)) return null;
  try {
    const url = new URL(value);
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password
    )
      return null;
    return url.href;
  } catch {
    return null;
  }
}
