const profileContent = `<section class="profile-settings" aria-label="Configurações da conta">
<h2>Configurações</h2>
<div data-contact-settings-container></div>
<div data-daily-settings></div>
<div data-call-settings></div>
<div data-device-settings></div>
<div data-representatives-settings></div>
<article class="card"><h2>Conteúdo e histórico</h2><p>Consulte seu espaço, backups e status.</p><div class="profile-content-links"><a href="#cofre">Cofre e backups</a><a href="#status">Meu status</a></div></article>
<article class="card"><h2>Aplicativo</h2><p id="pwa-state" role="status">Verificando atualização…</p><button id="check-updates" type="button">Verificar atualização</button></article>
</section>`;

export const pages = {
  conversas: { title: 'Conversas', content: '' },
  perfil: {
    title: 'Perfil',
    content: '<div data-public-profile-settings></div>' + profileContent,
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
