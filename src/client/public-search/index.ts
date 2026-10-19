import { t, translatedError } from '../../shared/i18n/index.ts';
import { searchMentions } from '../public-mentions/index.ts';
import type { MentionChoice } from '../public-mentions/index.ts';
import { mentionHref } from '../../shared/public-mentions/index.ts';
import { avatarInitials, avatarTone } from '../appearance/index.ts';
import { showPublicAvatar } from '../public-media/index.ts';
import { PublicSearchRequests, publicSearchQuery } from './query.ts';

const searchIcon =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg>';
/** One search field owns its own results, cancellation and keyboard navigation. */
export function mountPublicSearch(
  host: HTMLElement,
  signal: AbortSignal,
): void {
  host.classList.add('public-search');
  host.innerHTML = t('html.3b7e1f6a5e79', [searchIcon]);
  const input = host.querySelector<HTMLInputElement>('input')!,
    panel = host.querySelector<HTMLElement>('.public-search-results')!,
    status = host.querySelector<HTMLElement>('.public-search-status')!,
    list = host.querySelector<HTMLElement>('.public-search-list')!;
  panel.id = 'public-search-' + crypto.randomUUID();
  input.setAttribute('aria-controls', panel.id);
  const requests = new PublicSearchRequests(searchMentions);
  let timer: ReturnType<typeof setTimeout> | null = null;
  let media = new AbortController();
  let query = '';
  let selected = -1;
  const links = () => [...list.querySelectorAll<HTMLAnchorElement>('a')];
  const close = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    requests.close();
    media.abort();
    query = '';
    selected = -1;
    list.replaceChildren();
    panel.hidden = true;
    input.setAttribute('aria-expanded', 'false');
  };
  const show = (text: string) => {
    status.textContent = text;
    panel.hidden = false;
    input.setAttribute('aria-expanded', 'true');
  };
  const search = async () => {
    timer = null;
    const value = query;
    show(t('Searching…'));
    try {
      const choices = await requests.search(value);
      if (choices === null || signal.aborted || value !== query) return;
      list.replaceChildren();
      media.abort();
      media = new AbortController();
      selected = -1;
      const lifetime = AbortSignal.any([signal, media.signal]);
      renderResults(list, choices, lifetime);
      show(choices.length ? '' : t('No users or communities found.'));
    } catch (error: unknown) {
      if (!signal.aborted && value === query)
        show(
          error instanceof Error
            ? translatedError(error.message)
            : t('Could not search. Try again.'),
        );
    }
  };
  const changed = () => {
    close();
    try {
      query = publicSearchQuery(input.value);
    } catch (error: unknown) {
      show(
        error instanceof Error
          ? translatedError(error.message)
          : t('Invalid search.'),
      );
      return;
    }
    if (!query) return;
    timer = setTimeout(() => {
      void search();
    }, 250);
  };
  input.addEventListener('input', changed, { signal });
  input.addEventListener('focus', changed, { signal });
  host.querySelector('form')!.addEventListener(
    'submit',
    (event) => {
      event.preventDefault();
      if (selected >= 0) links()[selected]?.click();
      else changed();
    },
    { signal },
  );
  const move = (event: KeyboardEvent) => {
    const results = links();
    if (!results.length) return;
    event.preventDefault();
    const next =
      event.key === 'ArrowDown' ? selected + 1 : Math.max(0, selected) - 1;
    selected = (next + results.length) % results.length;
    results[selected]?.focus();
  };
  input.addEventListener(
    'keydown',
    (event) => {
      if (event.key === 'Escape') {
        close();
        return;
      }
      if (['ArrowDown', 'ArrowUp'].includes(event.key)) move(event);
    },
    { signal },
  );
  list.addEventListener(
    'keydown',
    (event) => {
      if (!(event instanceof KeyboardEvent)) return;
      if (event.key === 'Escape') {
        input.focus();
        close();
        return;
      }
      if (['ArrowDown', 'ArrowUp'].includes(event.key)) move(event);
    },
    { signal },
  );
  list.addEventListener(
    'click',
    () => {
      queueMicrotask(close);
    },
    { signal },
  );
  document.addEventListener(
    'pointerdown',
    (event) => {
      if (event.target instanceof Node && !host.contains(event.target)) close();
    },
    { signal },
  );
  host.addEventListener(
    'focusout',
    () => {
      queueMicrotask(() => {
        if (!host.contains(document.activeElement)) close();
      });
    },
    { signal },
  );
  window.addEventListener('hashchange', close, { signal });
  signal.addEventListener('abort', close, { once: true });
}
function searchChoice(
  choice: MentionChoice,
  signal: AbortSignal,
): HTMLAnchorElement {
  const link = document.createElement('a'),
    avatar = document.createElement('span'),
    copy = document.createElement('span'),
    name = document.createElement('strong'),
    kind = document.createElement('small');
  link.href = mentionHref(choice);
  link.className = 'public-search-choice';
  avatar.className = 'public-search-avatar';
  avatar.dataset['tone'] = avatarTone(choice.id);
  avatar.textContent = avatarInitials(choice.label);
  avatar.setAttribute('aria-hidden', 'true');
  name.textContent = choice.kind === 'user' ? '@' + choice.label : choice.label;
  kind.textContent =
    choice.kind === 'user' ? t('Public profile') : t('Community');
  copy.className = 'public-search-copy';
  copy.append(name, kind);
  link.append(avatar, copy);
  if (choice.avatar)
    showPublicAvatar(avatar, {
      kind: choice.kind === 'user' ? 'avatar' : 'community-photo',
      target: choice.id,
      reference: choice.avatar,
      signal,
    });
  return link;
}

function renderResults(
  list: HTMLElement,
  choices: MentionChoice[],
  signal: AbortSignal,
): void {
  for (const kind of ['user', 'community'] as const) {
    const items = choices.filter((choice) => choice.kind === kind);
    if (!items.length) continue;
    const heading = document.createElement('h3');
    heading.textContent = kind === 'user' ? t('Users') : t('Communities');
    list.append(heading);
    for (const item of items) list.append(searchChoice(item, signal));
  }
}
/** The side panel already owns a header field; the standalone toolbar mounts its own. */
export function mountPublicSearchToolbar(
  toolbar: HTMLElement,
  signal: AbortSignal,
): void {
  if (toolbar.closest('.feed-panel')) return;
  const host = document.createElement('div');
  toolbar.append(host);
  mountPublicSearch(host, signal);
}
