import { settingsSection } from './settings.ts';

const profileContent = `<section class="profile-settings" aria-label="Configurações da conta"><h2>Configurações</h2><p class="settings-intro">Abra a categoria que você quer ajustar.</p>
${settingsSection({ id: 'privacy', title: 'Quem pode me encontrar', description: 'Solicitações por wallet ou convite', content: '<div data-contact-settings-container></div>' })}
${settingsSection({ id: 'profile', title: 'Perfil público', description: 'Seu @ e sua foto nas comunidades', content: '<div data-public-profile-settings></div>' })}
${settingsSection({ id: 'alerts', title: 'Notificações e chamadas', description: 'Push, sons e silêncio das conversas', content: '<div data-daily-settings></div><div data-call-settings></div>' })}
${settingsSection({ id: 'devices', title: 'Aparelhos', description: 'Vincular, recuperar e gerenciar acessos', content: '<div data-device-settings></div>' })}
${settingsSection({ id: 'vault', title: 'Cofre e backup', description: 'Uso do armazenamento, salvar e restaurar', content: '<div class="cards" data-vault-settings></div>' })}
${settingsSection({ id: 'representatives', title: 'Organizações e representantes', description: 'Organizações e autorizações assinadas', content: '<div data-representatives-settings></div>' })}
${settingsSection({ id: 'appearance', title: 'Aparência', description: 'Tema Azul, Preto ou Branco', content: '<div data-appearance-settings></div>' })}
${settingsSection({ id: 'app', title: 'Aplicativo', description: 'Versão e atualizações', content: '<article class="card"><p id="pwa-state" role="status">Verificando atualização…</p><button id="check-updates" type="button">Verificar atualização</button></article>' })}
<div class="profile-content-links"><a href="#status">Meu status <span aria-hidden="true">↗</span></a></div></section>`;

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
