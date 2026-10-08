const icons = {
  profile:
    '<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',
  privacy:
    '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V6a4 4 0 0 1 8 0v4"/>',
  alerts: '<path d="M18 8a6 6 0 0 0-12 0v7l-2 3h16l-2-3zM10 21h4"/>',
  devices:
    '<rect x="3" y="3" width="12" height="16" rx="2"/><rect x="17" y="8" width="4" height="13" rx="1"/><path d="M8 16h2"/>',
  representatives: '<path d="m12 2 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z"/>',
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

/** Keep widgets mounted and drafts intact when another category is opened. */
export function bindSettingsSections(
  host: HTMLElement,
  collapsed: (id: string) => void,
): void {
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
}
