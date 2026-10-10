/** Only canonical YouTube video IDs enter our fixed player URL. No page scraping,
 * provider redirects, user HTML or arbitrary iframe URLs. */
export function youtubeVideoId(value: string): string | null {
  if (value.length > 2048) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port)
      return null;
    const id = videoPathId(url);
    return id && /^[A-Za-z0-9_-]{11}$/u.test(id) ? id : null;
  } catch {
    return null;
  }
}

function videoPathId(url: URL): string | null {
  if (url.hostname === 'youtu.be') return url.pathname.slice(1);
  if (
    !['youtube.com', 'www.youtube.com', 'm.youtube.com'].includes(url.hostname)
  )
    return null;
  if (url.pathname === '/watch') return url.searchParams.get('v');
  return (
    /^\/(?:shorts|live)\/([A-Za-z0-9_-]{11})$/u.exec(url.pathname)?.[1] ?? null
  );
}

/** A post has at most three distinct players, regardless of repeated links. */
export function externalVideoIds(text: string): string[] {
  const ids = new Set<string>();
  for (const match of text.matchAll(/https?:\/\/[^\s<>"']+/gu)) {
    const id = youtubeVideoId(match[0].replace(/[.,!?;:)\]]+$/u, ''));
    if (id) ids.add(id);
    if (ids.size === 3) break;
  }
  return [...ids];
}
