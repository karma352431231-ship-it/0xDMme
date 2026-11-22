import { t, currentLanguage } from '../../shared/i18n/index.ts';

/**
 * How Activity names the people behind a notice: "@a", "@a and @b" or
 * "@a, @b and 3 others", followed by what they did. In cards each named
 * handle is its own profile link (22/11/2026), so a mouse rest shows the
 * profile preview and a click or tap opens that profile, not the content.
 */
export type ActorAction = 'upvoted' | 'followed';

const families = {
  upvoted: [
    '@{0} upvoted',
    '@{0} and @{1} upvoted',
    '@{0}, @{1} and {2} others upvoted',
  ],
  followed: [
    '@{0} started following you',
    '@{0} and @{1} started following you',
    '@{0}, @{1} and {2} others started following you',
  ],
} as const;
/** Marks where a named handle sits in the translated sentence. */
const marker = '\u{E000}';

function template(
  handles: readonly string[],
  action: ActorAction,
): { source: string; values: string[] } {
  const family = families[action];
  const [first = '', second = ''] = handles;
  if (handles.length === 1) return { source: family[0], values: [first] };
  if (handles.length === 2)
    return { source: family[1], values: [first, second] };
  return {
    source: family[2],
    values: [
      first,
      second,
      (handles.length - 2).toLocaleString(currentLanguage()),
    ],
  };
}

export function actorsPhrase(
  handles: readonly string[],
  action: ActorAction,
): string {
  const { source, values } = template(handles, action);
  return t(source, values);
}

/** The same sentence with each named handle drawn by `link`. */
export function actorsPhraseNodes(
  handles: readonly string[],
  action: ActorAction,
  link: (handle: string) => HTMLElement,
): Node[] {
  const { source, values } = template(handles, action);
  const named = Math.min(handles.length, 2);
  const parts = t(
    source,
    values.map((value, index) =>
      index < named ? `${marker}${index}${marker}` : value,
    ),
  ).split(marker);
  return parts.flatMap((part, index): Node[] => {
    if (index % 2 === 1) return [link(handles[Number(part)] ?? '')];
    // The "@" before a handle belongs to its link.
    const text = index < parts.length - 1 ? part.replace(/@$/u, '') : part;
    return text ? [document.createTextNode(text)] : [];
  });
}

export function profileHref(handle: string): string {
  return `#users?handle=${encodeURIComponent(handle)}`;
}

/** A plain profile link; the global hover card previews `#users` links. */
export function profileLink(handle: string): HTMLAnchorElement {
  const link = document.createElement('a');
  link.className = 'activity-card-actor';
  link.href = profileHref(handle);
  link.textContent = '@' + handle;
  return link;
}
