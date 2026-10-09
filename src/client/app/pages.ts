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

const profileContent = `<section class="profile-settings" aria-label="Configurações da conta"><h2>Configurações</h2><p class="settings-intro">Abra a categoria que você quer ajustar.</p>
${settingsSection({ id: 'privacy', title: 'Quem pode me encontrar', description: 'Solicitações por wallet ou convite', content: '<div data-contact-settings-container></div>' })}
${settingsSection({ id: 'profile', title: 'Perfil público', description: 'Seu @ e sua foto nas comunidades', content: '<div data-public-profile-settings></div>' })}
${settingsSection({ id: 'alerts', title: 'Notificações e chamadas', description: 'Push, sons e silêncio das conversas', content: '<div data-daily-settings></div><div data-call-settings></div>' })}
${settingsSection({ id: 'devices', title: 'Aparelhos', description: 'Vincular, recuperar e gerenciar acessos', content: '<div data-device-settings></div>' })}
${settingsSection({ id: 'vault', title: 'Cofre e backup', description: 'Uso do armazenamento, salvar e restaurar', content: '<div class="cards" data-vault-settings></div>' })}
${settingsSection({ id: 'representatives', title: 'Organizações e representantes', description: 'Organizações e autorizações assinadas', content: '<div data-representatives-settings></div>' })}
${settingsSection({ id: 'appearance', title: 'Aparência', description: 'Tema Azul, Preto ou Branco', content: '<div data-appearance-settings></div>' })}
${settingsSection({ id: 'app', title: 'Aplicativo', description: 'Versão e atualizações', content: '<article class="card"><p id="pwa-state" role="status">Verificando atualização…</p><button id="check-updates" type="button">Verificar atualização</button></article>' })}
<div class="profile-content-links"><a href="#contatos">Contatos, agenda e convite <span aria-hidden="true">↗</span></a><a href="#status">Meu status <span aria-hidden="true">↗</span></a></div></section>`;

export const pages = {
  conversas: { title: 'Conversas', content: '' },
  atividade: {
    title: 'Atividade',
    content: '<div class="activity" data-activity></div>',
  },
  comunidades: {
    title: 'Comunidades',
    content: '<div data-communities></div>',
  },
  perfil: {
    title: 'Perfil',
    content: profileContent,
  },
  publico: {
    title: 'Perfil público',
    content: '<div data-public-profile-view></div>',
  },
  status: {
    title: 'Status',
    content: '<div class="cards" data-status-container></div>',
  },
  contatos: {
    title: 'Contatos',
    content: '<div class="cards" data-contacts-container></div>',
  },
  cofre: {
    title: 'Cofre',
    content: '<div class="cards" data-vault-container></div>',
  },
};

export type PageKey = keyof typeof pages;

/** Resolve presentation only; wallet-return fragments stay intact for account. */
export function pageKey(hash: string): PageKey | null {
  const selected = hash.slice(1).split('?')[0] ?? '';
  if (selected === 'workspace') return null;
  if (selected === 'configuracoes') return 'perfil';
  return Object.hasOwn(pages, selected) ? (selected as PageKey) : 'conversas';
}
