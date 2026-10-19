import { appAddress, navigateApp } from '../app-navigation/index.ts';
import { t } from '../../shared/i18n/index.ts';
import {
  appHref,
  appRoute,
  routeParams,
} from '../../shared/app-routes/index.ts';
const icons = {
  profile:
    '<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',
  privacy:
    '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V6a4 4 0 0 1 8 0v4"/>',
  alerts: '<path d="M18 8a6 6 0 0 0-12 0v7l-2 3h16l-2-3zM10 21h4"/>',
  devices:
    '<rect x="3" y="3" width="12" height="16" rx="2"/><rect x="17" y="8" width="4" height="13" rx="1"/><path d="M8 16h2"/>',
  vault:
    '<ellipse cx="12" cy="5.5" rx="7.5" ry="2.5"/><path d="M4.5 5.5v13c0 1.4 3.4 2.5 7.5 2.5s7.5-1.1 7.5-2.5v-13M4.5 12c0 1.4 3.4 2.5 7.5 2.5s7.5-1.1 7.5-2.5"/>',
  representatives: '<path d="m12 2 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z"/>',
  appearance:
    '<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 0 0 18z" fill="currentColor"/>',
  app: '<path d="M20 7a9 9 0 1 0 1 7M20 2v5h-5"/>',
} as const;

/** Static authored content only; never interpolate account data here. */
export function settingsSection(input: {
  id: keyof typeof icons;
  title: string;
  description: string;
  content: string;
}): string {
  return `<details class="settings-section" data-settings-section="${input.id}"><summary><span class="settings-icon" aria-hidden="true"><svg viewBox="0 0 24 24">${icons[input.id]}</svg></span><span><strong>${input.title}</strong><small>${input.description}</small></span><span class="settings-chevron" aria-hidden="true">⌄</span></summary><div class="settings-body">${input.content}</div></details>`;
}

/** Wide screens show one category beside the list, as in the approved mockup. */
const wideSettings = '(min-width: 1280px)';

/** Keep widgets mounted and drafts intact when another category is opened. */
export function bindSettingsSections(
  host: HTMLElement,
  collapsed: (id: string) => void,
): HTMLDetailsElement[] {
  const sections = [
    ...host.querySelectorAll<HTMLDetailsElement>('[data-settings-section]'),
  ];
  for (const section of sections)
    section.addEventListener('toggle', () => {
      if (!section.open) {
        collapsed(section.dataset['settingsSection'] ?? '');
        return;
      }
      for (const other of sections) if (other !== section) other.open = false;
    });
  return sections;
}

/**
 * The last opened category reopens after a reload. Device-only convenience:
 * without storage (private mode, blocked site data) the list simply starts closed.
 */
export const settingsSectionKey = '0xdmme:settings-section';
type SectionStorage = Pick<Storage, 'getItem' | 'setItem'>;
export function savedSettingsSection(storage: SectionStorage): string | null {
  try {
    return storage.getItem(settingsSectionKey);
  } catch {
    return null;
  }
}
export function saveSettingsSection(storage: SectionStorage, id: string): void {
  try {
    storage.setItem(settingsSectionKey, id);
  } catch {
    // The category still opens; only the reload memory is unavailable.
  }
}

/** `#settings?section=<id>` opens that category, e.g. "Editar perfil público". */
export function requestedSettingsSection(hash: string): string | null {
  return routeParams(hash).get('section');
}
/** Opens a category by id; unknown ids leave the page as it is. */
export function openSettingsSection(
  host: HTMLElement,
  id: string | null,
): void {
  if (!id) return;
  const section = [
    ...host.querySelectorAll<HTMLDetailsElement>('[data-settings-section]'),
  ].find((node) => node.dataset['settingsSection'] === id);
  if (!section) return;
  section.open = true;
  section.scrollIntoView({ block: 'nearest' });
}

/** Delayed toggles from a previous page must not replace its new destination. */
function rememberSettingsSection(section: HTMLDetailsElement): void {
  const id = section.dataset['settingsSection'];
  if (!section.isConnected || !section.open || !id) return;
  const route = appRoute(appAddress());
  if (route?.page !== 'settings') return;
  saveSettingsSection(localStorage, id);
  if (route.params.get('section') !== id)
    navigateApp(appHref('settings', new URLSearchParams({ section: id })));
}

/** Category list, shortcuts and the always-open category of the wide layout. */
export function startSettingsCategories(
  host: HTMLElement,
  sections: readonly HTMLDetailsElement[],
): void {
  const categories = categoryList(host, sections);
  const wide = (): boolean => matchMedia(wideSettings).matches;
  for (const section of sections) {
    section.addEventListener('toggle', categories.sync);
    section.addEventListener('toggle', () => {
      rememberSettingsSection(section);
    });
    // Beside the list the open category is the page itself; it closes on phones.
    section.querySelector('summary')?.addEventListener('click', (event) => {
      if (wide() && section.open) event.preventDefault();
    });
  }
  host
    .querySelectorAll<HTMLElement>('[data-open-section]')
    .forEach((control) => {
      control.addEventListener('click', () => {
        const target = sections.find(
          (section) =>
            section.dataset['settingsSection'] ===
            control.dataset['openSection'],
        );
        if (target) target.open = true;
      });
    });
  // A link to a category opens it. Beside the list (wide screens) the last
  // category returns; on phones the plain Profile tab shows the list instead
  // (16/10/2026), and a reload keeps its category through the URL.
  const saved =
    requestedSettingsSection(appAddress()) ??
    (wide() ? savedSettingsSection(localStorage) : null);
  const last = sections.find(
    (section) => section.dataset['settingsSection'] === saved,
  );
  if (last) last.open = true;
  else if (wide() && !sections.some((section) => section.open))
    categories.first?.click();
}

/** Category buttons for the wide layout, built from each section's own summary. */
function categoryList(
  host: HTMLElement,
  sections: readonly HTMLDetailsElement[],
): { first: HTMLButtonElement | null; sync: () => void } {
  const nav = document.createElement('nav');
  nav.className = 'profile-categories';
  nav.setAttribute('aria-label', t('Settings categories'));
  const buttons = new Map<HTMLDetailsElement, HTMLButtonElement>();
  for (const section of sections) {
    if (section.dataset['settingsSection'] === 'account') continue;
    const summary = section.querySelector('summary');
    const icon = summary?.querySelector('.settings-icon');
    const copy = summary?.querySelector('span:nth-child(2)');
    if (!icon || !copy) continue;
    const button = document.createElement('button');
    button.type = 'button';
    button.append(icon.cloneNode(true), copy.cloneNode(true));
    button.addEventListener('click', () => {
      section.open = true;
    });
    buttons.set(section, button);
    nav.append(button);
  }
  host.querySelector('.profile-settings')?.before(nav);
  const sync = (): void => {
    for (const [section, button] of buttons)
      if (section.open) button.setAttribute('aria-current', 'true');
      else button.removeAttribute('aria-current');
  };
  return { first: buttons.values().next().value ?? null, sync };
}

const profileContent = t('html.148d3089e900', [
  settingsSection({
    id: 'privacy',
    title: t('Privacy'),
    description: t('Presence, read receipts and who can find me'),
    content:
      '<div data-privacy-settings></div><div data-contact-settings-container></div>',
  }),
  settingsSection({
    id: 'profile',
    title: t('Public profile'),
    description: t('Your handle and photo in communities'),
    content: '<div data-public-profile-settings></div>',
  }),
  settingsSection({
    id: 'alerts',
    title: t('Notifications and calls'),
    description: t('Push, sounds and conversation muting'),
    content: '<div data-daily-settings></div><div data-call-settings></div>',
  }),
  settingsSection({
    id: 'devices',
    title: t('Connected devices'),
    description: t('Link, recover and manage access'),
    content: '<div data-device-settings></div>',
  }),
  settingsSection({
    id: 'vault',
    title: t('Vault and backup'),
    description: t('Storage usage, save and restore'),
    content: '<div class="cards" data-vault-settings></div>',
  }),
  settingsSection({
    id: 'representatives',
    title: t('Organizations and representatives'),
    description: t('Organizations and signed authorizations'),
    content: '<div data-representatives-settings></div>',
  }),
  settingsSection({
    id: 'appearance',
    title: t('settings.appearance-language'),
    description: t('settings.appearance-language.detail'),
    content: '<div data-appearance-settings></div>',
  }),
  settingsSection({
    id: 'app',
    title: t('About the app'),
    description: t('Version, updates, source code and licenses'),
    content: t('html.33d7dbf67efc'),
  }),
]);

export const pages = {
  conversas: { title: t('Conversations'), content: '' },
  atividade: {
    title: t('Activity'),
    content: '<div class="activity" data-activity></div>',
  },
  comunidades: {
    title: t('Communities'),
    content: '<div data-communities></div>',
  },
  perfil: {
    title: t('Profile'),
    content: profileContent,
  },
  analise: {
    title: t('Content analysis'),
    content: '<div data-moderation-review></div>',
  },
  publico: {
    title: t('Public profile'),
    content: '<div data-public-profile-view></div>',
  },
  status: {
    title: t('Status'),
    content: '<div class="cards" data-status-container></div>',
  },
  contatos: {
    title: t('Contacts'),
    content: '<div class="cards" data-contacts-container></div>',
  },
  cofre: {
    title: t('Vault'),
    content: '<div class="cards" data-vault-container></div>',
  },
};

export type PageKey = keyof typeof pages;

/** Settings are mounted only after an authenticated session exists. */
export function profileSessionChanged(
  page: string,
  mounted: boolean,
  authenticated: boolean,
): boolean {
  return page === 'perfil' && mounted !== authenticated;
}
export function pageContent(key: PageKey, authenticated: boolean): string {
  return key === 'perfil' && !authenticated ? '' : pages[key].content;
}

/** Resolve presentation only; wallet-return fragments stay intact for account. */
export function pageKey(hash: string): PageKey | null {
  const selected = hash.slice(1).split('?')[0] ?? '';
  if (selected === 'workspace') return null;
  const route = appRoute(hash);
  const keys = {
    chats: 'conversas',
    split: 'conversas',
    activity: 'atividade',
    communities: 'comunidades',
    settings: 'perfil',
    users: 'publico',
    review: 'analise',
    contacts: 'contatos',
    vault: 'cofre',
    status: 'status',
  } as const;
  return route ? keys[route.page] : 'conversas';
}
