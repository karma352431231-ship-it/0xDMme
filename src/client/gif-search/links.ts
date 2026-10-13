/** Integrated GIF media only. Unknown sites and provider pages remain links. */
const media =
  /^https:\/\/static\.klipy\.com\/ii\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*\.(?:mp4|webp|gif)$/u;
const urls = /https:\/\/[^\s<>"']+/gu;
export function gifMessageUrl(text: string): string | null {
  const value = text.trim();
  return value.length <= 300 && media.test(value) ? value : null;
}
function bareUrl(value: string): string {
  return value.replace(/[.,!?;:]+$/u, '');
}
/** Three clips per text, deduplicated without fetching or resolving URLs. */
export function gifUrls(text: string): string[] {
  const found = new Set<string>();
  for (const match of text.matchAll(urls)) {
    const url = gifMessageUrl(bareUrl(match[0]));
    if (url) found.add(url);
    if (found.size === 3) break;
  }
  return [...found];
}
/** Hide only references that the caller renders separately; source text stays intact. */
export function withoutGifLinks(
  text: string,
  displayed: readonly string[],
): string {
  if (!displayed.length) return text;
  return text
    .replace(urls, (match) => {
      const url = bareUrl(match);
      return displayed.includes(url) ? match.slice(url.length) : match;
    })
    .trim();
}
