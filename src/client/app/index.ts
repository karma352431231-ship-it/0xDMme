import { startPwa } from '../pwa/index.ts';
import { startAccount } from '../account/index.ts';
import { startDevices } from '../devices/index.ts';
import { startBackups } from '../backups/index.ts';
import { startVault } from '../vault-ui/index.ts';
import { startMessages } from '../messages/index.ts';
import { startContacts } from '../contacts/index.ts';
import type { AccountSession } from '../../shared/account/index.ts';

const pages = {
  conversas: {
    title: 'Conversas',
    content: `<div data-messages-container></div>`,
  },
  contatos: {
    title: 'Contatos',
    content: `<div class="cards" data-contacts-container></div>`,
  },
  cofre: {
    title: 'Cofre',
    content: `<div class="cards" data-vault-container></div>`,
  },
  configuracoes: {
    title: 'Configurações',
    content: `<div data-daily-settings></div><div class="cards"><article class="card"><span class="eyebrow">PRIVACIDADE</span><h2>Você escolhe o que compartilhar.</h2><p>Salve suas escolhas no perfil cifrado acima. Online, último acesso e leitura começam desligados, com escolhas independentes. Somente contatos aprovados podem consultar os sinais habilitados.</p><div class="privacy-list"><div class="privacy-row"><span>Exibir online</span><span>Escolha no perfil</span></div><div class="privacy-row"><span>Exibir último acesso</span><span>Escolha no perfil</span></div><div class="privacy-row"><span>Enviar confirmação de leitura</span><span>Escolha no perfil</span></div></div></article><article class="card"><span class="eyebrow">APLICATIVO</span><h2>Seu espaço, também na tela inicial.</h2><p>Use a opção de instalação do navegador quando disponível. Offline, abra a cópia local do cofre para consultar blocos já carregados neste aparelho.</p><p id="pwa-state" role="status">Verificando disponibilidade offline…</p><button class="primary" id="check-updates" type="button">Verificar atualização</button></article></div>`,
  },
};

function element<T extends HTMLElement>(id: string): T {
  const result = document.getElementById(id);
  if (!result) throw new Error('Interface incompleta.');
  return result as T;
}

let connectedAccount: AccountSession | null = null;
const devices = startDevices({
  changed: async () => {
    await account.refreshPrivate();
    connection();
  },
  replaceDevice: async () => {
    await account.replaceDevice();
  },
});
const vault = startVault(devices);
const backups = startBackups(devices, vault.sync);
const contacts = startContacts(devices, vault.sync);
const messages = startMessages(
  devices,
  vault.sync,
  () => account.sharedProfile(),
  () => account.privacyPreferences(),
);
const account = startAccount({
  privacyChanged: (preferences) => messages.applyPrivacy(preferences),
  privateKey: async (session) => {
    const key = await devices.privateKey(session);
    connection();
    return key;
  },
  saveProfile: (session, profile, key) =>
    devices.saveProfile(session, profile, key),
  changed: (session) => {
    connectedAccount = session;
    devices.setSession(session);
    vault.setSession(session);
    backups.setSession(session);
    contacts.setSession(session);
    messages.setSession(session);
    connection();
    const label = document.getElementById('account-label');
    if (label)
      label.textContent = session
        ? session.name || 'Conta conectada'
        : 'Conta não conectada';
  },
});
// Approval HTML is loaded online and does not install or activate a shell.
const pwa = account.approvalPage
  ? null
  : startPwa({
      canActivate: () =>
        account.canActivate() &&
        devices.canActivate() &&
        vault.canActivate() &&
        backups.canActivate() &&
        contacts.canActivate() &&
        messages.canActivate(),
    });

function route(): void {
  if (account.approvalPage) {
    renderApprovalPage();
    return;
  }
  const selected = location.hash.slice(1).split('?')[0] ?? '';
  if (selected === 'workspace') return;
  const key = Object.hasOwn(pages, selected)
    ? (selected as keyof typeof pages)
    : 'conversas';
  const page = pages[key];
  element('page-title').textContent = page.title;
  element('breadcrumb').textContent = page.title.toLocaleUpperCase('pt-BR');
  // Templates are static authored content. No user/server input enters HTML.
  element('page-content').innerHTML = page.content;
  mountAccountPanels(key);
  mountFeature(key);
  document.querySelectorAll<HTMLAnchorElement>('nav a').forEach((link) => {
    if (link.dataset['route'] === key)
      link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  document.title = `${page.title} · 0xDMme`;
  const button = document.getElementById('check-updates');
  button?.addEventListener('click', () => {
    void pwa?.check();
  });
  pwa?.render();
}
function mountFeature(key: keyof typeof pages): void {
  const content = element('page-content');
  const dailyContainer = content.querySelector<HTMLElement>(
    '[data-daily-settings]',
  );
  if (dailyContainer) messages.mountSettings(dailyContainer);
  const messageContainer = content.querySelector<HTMLElement>(
    '[data-messages-container]',
  );
  if (key === 'conversas' && messageContainer) messages.mount(messageContainer);
  const contactContainer = content.querySelector<HTMLElement>(
    '[data-contacts-container]',
  );
  if (key === 'contatos' && contactContainer) contacts.mount(contactContainer);
  const vaultContainer = content.querySelector<HTMLElement>(
    '[data-vault-container]',
  );
  if (key === 'cofre' && vaultContainer) {
    vault.mount(vaultContainer);
    const backupContainer = document.createElement('div');
    backupContainer.className = 'backup-card';
    vaultContainer.after(backupContainer);
    backups.mount(backupContainer);
  }
}

function mountAccountPanels(key: keyof typeof pages): void {
  if (
    key === 'configuracoes' ||
    key === 'conversas' ||
    key === 'cofre' ||
    key === 'contatos'
  ) {
    const container = document.createElement('div');
    container.className = 'account-section';
    element('page-content').prepend(container);
    account.mount(container);
  }
  if (key === 'configuracoes' || key === 'cofre' || key === 'contatos') {
    const container = document.createElement('div');
    container.className = 'account-section';
    element('page-content').append(container);
    devices.mount(container);
  }
}

function renderApprovalPage(): void {
  element('page-title').textContent = 'Confirmar assinatura';
  element('breadcrumb').textContent = 'CONTA';
  const container = document.createElement('div');
  element('page-content').replaceChildren(container);
  account.mount(container);
  document.title = 'Confirmar assinatura · 0xDMme';
}

function connection(): void {
  if (connectedAccount && devices.authorized()) messages.ready();
  element('connection').textContent = navigator.onLine
    ? connectedAccount
      ? devices.authorized()
        ? 'Conta conectada · aparelho autorizado'
        : 'Conta conectada · aparelho pendente'
      : 'Conexão disponível · nenhuma conta conectada'
    : 'Sem conexão · abra a cópia local do cofre';
}

window.addEventListener('hashchange', route);
window.addEventListener('online', connection);
window.addEventListener('offline', connection);
route();
connection();
