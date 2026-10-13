import { catalog } from './catalog.ts';
import { errorTemplates } from './error-templates.ts';

export const languages = [
  { id: 'en', label: 'English' },
  { id: 'zh-CN', label: '简体中文' },
] as const;
export type AppLanguage = (typeof languages)[number]['id'];
export const languageStorageKey = '0xdmme:language';
function initialLanguage(): AppLanguage {
  try {
    const stored = globalThis.localStorage?.getItem(languageStorageKey);
    if (isAppLanguage(stored)) return stored;
  } catch {
    // Importing shared code must also work without browser storage.
  }
  return preferredLanguage(globalThis.navigator?.languages ?? ['en']);
}
let active: AppLanguage = initialLanguage();
const sourceByTranslation = new Map<string, string>();
for (const [source, pair] of Object.entries(catalog))
  for (const translated of pair) sourceByTranslation.set(translated, source);

function regexText(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}
const errorPatterns = errorTemplates.flatMap((source) =>
  [source, ...catalog[source]!].map((text) => ({
    source,
    pattern: new RegExp(
      `^${text.split('{0}').map(regexText).join('([0-9]+(?:\\.[0-9]+)?)')}$`,
      'u',
    ),
  })),
);

export function isAppLanguage(value: unknown): value is AppLanguage {
  return value === 'en' || value === 'zh-CN';
}
export function currentLanguage(): AppLanguage {
  return active;
}
export function setActiveLanguage(value: AppLanguage): void {
  active = value;
}
export function preferredLanguage(values: readonly string[]): AppLanguage {
  const supported = values.find((value) => /^(?:zh|en)(?:-|$)/iu.test(value));
  return supported && /^zh(?:-|$)/iu.test(supported) ? 'zh-CN' : 'en';
}

/** Static document text is translated once, before account/user data enters the DOM. */
export function staticText(value: string): string {
  const text = value.trim();
  const normalized = text.replace(/\s+/gu, ' ');
  const source = Object.hasOwn(catalog, text)
    ? text
    : Object.hasOwn(catalog, normalized)
      ? normalized
      : sourceByTranslation.get(normalized);
  return source ? value.replace(text, t(source)) : value;
}

/** Only authored templates enter here; substitutions are never translated or reparsed. */
export function t(
  source: string,
  values: readonly (string | number | boolean | null | undefined)[] = [],
  language = active,
): string {
  const entry = Object.hasOwn(catalog, source) ? catalog[source] : undefined;
  if (!entry) throw new Error(`Missing translation: ${source}`);
  const translated = entry[language === 'en' ? 0 : 1];
  return translated.replace(/\{(\d+)\}/gu, (_, index: string) =>
    String(values[Number(index)] ?? `{${index}}`),
  );
}

/** Server/library errors stay in their wire format until they reach the UI. */
export function translatedError(message: string): string {
  const source = Object.hasOwn(catalog, message)
    ? message
    : sourceByTranslation.get(message);
  if (source) return t(source);
  for (const entry of errorPatterns) {
    const match = entry.pattern.exec(message);
    if (match) return t(entry.source, [match[1]]);
  }
  // API diagnostics append only fixed operation/status identifiers.
  const diagnostic =
    /^(.*) (\[[a-z]+(?:[/-][a-z]+)* · (?:HTTP [1-5][0-9]{2}|sem resposta HTTP|no HTTP response|无 HTTP 响应) · (?:http|non-json|invalid-json|network|timeout|cancelled) · (?:json|html|other|missing)\])$/u.exec(
      message,
    );
  if (diagnostic) return `${translatedError(diagnostic[1]!)} ${diagnostic[2]}`;
  return active === 'en'
    ? 'The operation could not be completed. Please try again.'
    : '操作未能完成。请重试。';
}
