import {
  currentLanguage,
  isAppLanguage,
  languages,
  languageStorageKey,
  preferredLanguage,
  t,
  staticText,
  translatedError,
} from '../../shared/i18n/index.ts';
import type { AppLanguage } from '../../shared/i18n/index.ts';
import { settingGroup, settingRow } from '../settings-ui/index.ts';

const cacheName = '0xdmme-device-preferences';
const cachePath = '/.0xdmme/language-preference';

export async function pushLanguage(): Promise<AppLanguage> {
  const cache = await caches.open(cacheName);
  const response = await cache.match(new URL(cachePath, location.origin).href);
  if (!response)
    return preferredLanguage(globalThis.navigator?.languages ?? ['en']);
  const value = await response.text();
  if (!isAppLanguage(value)) throw new Error('Invalid language preference.');
  return value;
}

/** Prepare the next opening and background alerts without changing the live UI. */
export async function applyLanguage(value: AppLanguage): Promise<void> {
  if (!isAppLanguage(value)) throw new Error('Invalid language preference.');
  if ('caches' in globalThis) {
    const cache = await caches.open(cacheName);
    const url = new URL(cachePath, location.origin).href;
    const prior = await cache.match(url);
    if (!prior || (await prior.text()) !== value)
      await cache.put(url, new Response(value));
  }
  if (localStorage.getItem(languageStorageKey) !== value)
    localStorage.setItem(languageStorageKey, value);
}

/** Use the same opening snapshot as module templates, before mounting user data. */
export function startLanguage(): void {
  document.documentElement.lang = currentLanguage();
  translateDocument(document.documentElement);
}

function translateDocument(root: Node): void {
  const nodes = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  while (nodes.nextNode()) {
    const node = nodes.currentNode as Text;
    if (node.parentElement?.closest('script, style')) continue;
    node.data = staticText(node.data);
  }
  const elements =
    root instanceof Element
      ? [root, ...root.querySelectorAll('*')]
      : root instanceof DocumentFragment
        ? [...root.querySelectorAll('*')]
        : [];
  for (const element of elements) {
    for (const name of [
      'aria-label',
      'title',
      'alt',
      'placeholder',
      'content',
    ]) {
      const value = element.getAttribute(name);
      if (value) element.setAttribute(name, staticText(value));
    }
    if (element instanceof HTMLTemplateElement)
      translateDocument(element.content);
  }
}

export function languageSelect(value = currentLanguage()): HTMLSelectElement {
  const select = document.createElement('select');
  select.name = 'language';
  select.setAttribute('aria-label', t('App language'));
  for (const language of languages) {
    const option = document.createElement('option');
    option.value = language.id;
    option.textContent = language.label;
    select.append(option);
  }
  select.value = value;
  return select;
}

interface LanguageChoice {
  language: AppLanguage;
  save: (language: AppLanguage) => Promise<void>;
  blocked: () => string | null;
  signal?: AbortSignal;
}

class LanguageChangeBlocked extends Error {}

function guardChoice(input: LanguageChoice): void {
  input.signal?.throwIfAborted();
  const reason = input.blocked();
  if (reason) throw new LanguageChangeBlocked(reason);
}

/** Recheck interruption safety after each async step, before callers reload. */
export async function saveLanguageChoice(input: LanguageChoice): Promise<void> {
  guardChoice(input);
  await input.save(input.language);
  guardChoice(input);
  await applyLanguage(input.language);
  guardChoice(input);
}

export function languageFailure(error: unknown): string {
  if (error instanceof LanguageChangeBlocked) return error.message;
  return error instanceof Error
    ? translatedError(error.message)
    : t('Could not save your language.');
}

export function mountLanguageSettings(
  host: HTMLElement,
  save: (language: AppLanguage) => Promise<void>,
  blocked: () => string | null,
): void {
  const group = document.createElement('div');
  // Static authored markup; the select and button are added as nodes below.
  group.innerHTML = `${settingGroup({
    title: t('Language'),
    rows: settingRow({
      icon: 'globe',
      label: t('App language'),
      for: 'settings-language',
      control: '<span class="language-controls" data-language-controls></span>',
    }),
  })}<p class="set-status" role="status" data-language-status></p>`;
  const controls = group.querySelector('[data-language-controls]')!,
    status = group.querySelector('[data-language-status]')!;
  const select = languageSelect();
  select.id = 'settings-language';
  select.classList.add('set-select');
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'set-btn set-primary';
  button.textContent = t('Save');
  // The save button appears only for a language other than the current one.
  button.hidden = true;
  select.addEventListener('change', () => {
    button.hidden = select.value === currentLanguage();
    status.textContent = '';
  });
  button.addEventListener('click', () => {
    const value = select.value;
    if (!isAppLanguage(value)) return;
    const reason = blocked();
    if (reason) {
      status.textContent = reason;
      return;
    }
    button.disabled = true;
    void saveLanguageChoice({ language: value, save, blocked })
      .then(() => {
        // Reload happens after the explicit choice; it never submits another form.
        if (value === currentLanguage()) {
          status.textContent = t('Language saved.');
          button.disabled = false;
          button.hidden = true;
        } else location.reload();
      })
      .catch((error: unknown) => {
        status.textContent = languageFailure(error);
        button.disabled = false;
      });
  });
  controls.append(select, button);
  host.append(...group.childNodes);
}
