import { startPwa } from '../pwa/index.ts';
import { startAccount } from '../account/index.ts';
import { startDevices } from '../devices/index.ts';
import { startBackups } from '../backups/index.ts';
import { startVault } from '../vault-ui/index.ts';
import { startMessages } from '../messages/index.ts';
import { startStatus } from '../status/index.ts';
import { startRepresentatives } from '../representatives/index.ts';
import { startContacts } from '../contacts/index.ts';
import { VoicePlayback } from '../voice-playback/index.ts';
import type { AccountSession } from '../../shared/account/index.ts';
import type { AddressBookEntry } from '../../shared/contacts/index.ts';

const pages = {
  conversas: {
    title: 'Conversas',
    content: '',
  },
  perfil: { title: 'Perfil', content: '' },
  status: {
    title: 'Status',
    content: `<div class="cards" data-status-container></div>`,
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
    content: `<div data-contact-settings-container></div><div data-daily-settings></div><div data-representatives-settings></div><article class="card"><h2>Aplicativo</h2><p id="pwa-state" role="status">Verificando atualização…</p><button id="check-updates" type="button">Verificar atualização</button></article>`,
  },
};

function element<T extends HTMLElement>(id: string): T {
  const result = document.getElementById(id);
  if (!result) throw new Error('Interface incompleta.');
  return result as T;
}

let connectedAccount: AccountSession | null = null;
const conversationContent = document.createElement('div');
conversationContent.className = 'conversation-content';
let currentPage = '';
let currentHash = '';
function openConversation(): void {
  if (location.hash !== '#conversas') {
    location.hash = '#conversas';
    route();
  }
  element('app-shell').dataset['chatOpen'] = 'true';
  element('workspace').scrollTop = 0;
}
const devices = startDevices({
  changed: async () => {
    await account.refreshPrivate();
    connection();
  },
  linked: (session) => account.acceptLinkedSession(session),
  confirmWallet: () => account.confirmWallet(),
});
const vault = startVault(devices);
const playback = new VoicePlayback();
const backups = startBackups(devices, vault.sync, playback, {
  reminder: () => account.backupReminder(),
  confirmWallet: () => account.confirmWallet(),
  profile: () => account.backupProfile(),
});
const contacts = startContacts(devices, vault.sync, {
  saved: (contact) => messages.contactSaved(contact),
});
const statuses = startStatus(devices, vault.sync);
const representatives = startRepresentatives(devices, vault.sync, (message) =>
  account.signStatement(message),
);
const messages = startMessages(devices, vault.sync, {
  playback,
  openConversation,
  openContact: (contact: AddressBookEntry) => {
    location.hash = '#contatos';
    route();
    contacts.showContact(contact);
  },
  directoryChanged: (available) => {
    const shell = document.getElementById('app-shell');
    if (shell) shell.dataset['history'] = available ? 'available' : 'empty';
  },
  representatives,
  liveEvent: (event) => statuses.event(event),
  liveState: (connected) => statuses.liveConnection(connected),
  sharedProfile: () => account.sharedProfile(),
  preferences: () => account.privacyPreferences(),
});
const account = startAccount({
  privacyChanged: (preferences) => messages.applyPrivacy(preferences),
  privateKey: async (session, walletOpening) => {
    const key = await devices.privateKey(session, walletOpening);
    connection();
    return key;
  },
  saveProfile: (session, profile, key) =>
    devices.saveProfile(session, profile, key),
  changed: (session) => {
    connectedAccount = session;
    const shell = document.getElementById('app-shell');
    if (shell) {
      shell.dataset['account'] = session ? 'connected' : 'guest';
      if (!session) shell.dataset['chatOpen'] = 'false';
    }
    devices.setSession(session);
    vault.setSession(session);
    backups.setSession(session);
    contacts.setSession(session);
    messages.setSession(session);
    statuses.setSession(session);
    representatives.setSession(session);
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
      blockedReason: () => devices.updateBlockReason(),
      canActivate: () =>
        account.canActivate() &&
        devices.canActivate() &&
        vault.canActivate() &&
        backups.canActivate() &&
        contacts.canActivate() &&
        messages.canActivate() &&
        statuses.canActivate() &&
        representatives.canActivate(),
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
  if (currentPage === key && currentHash === location.hash) return;
  currentPage = key;
  currentHash = location.hash;
  element('app-shell').dataset['page'] = key;
  const page = pages[key];
  element('page-title').textContent = page.title;
  element('breadcrumb').textContent = page.title.toLocaleUpperCase('pt-BR');
  messages.leave();
  statuses.leave();
  representatives.leave();
  backups.leave();
  vault.leave();
  // Templates are static authored content. No user/server input enters HTML.
  element('page-content').innerHTML = page.content;
  if (key === 'conversas') element('page-content').append(conversationContent);
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
  const representativeContainer = content.querySelector<HTMLElement>(
    '[data-representatives-settings]',
  );
  if (representativeContainer)
    representatives.mountSettings(representativeContainer);
  const contactSettings = content.querySelector<HTMLElement>(
    '[data-contact-settings-container]',
  );
  if (contactSettings) contacts.mount(contactSettings, 'settings');
  if (key === 'conversas') messages.ready();
  mountStatusFeature(key, content);
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

function mountStatusFeature(
  key: keyof typeof pages,
  content: HTMLElement,
): void {
  const container = content.querySelector<HTMLElement>(
    '[data-status-container]',
  );
  if (key === 'status' && container) statuses.mount(container);
}

function mountAccountPanels(key: keyof typeof pages): void {
  if (
    key === 'perfil' ||
    key === 'configuracoes' ||
    key === 'conversas' ||
    key === 'cofre' ||
    key === 'contatos' ||
    key === 'status'
  ) {
    const container = document.createElement('div');
    container.className = 'account-section';
    element('page-content').prepend(container);
    account.mount(
      container,
      key === 'configuracoes' || key === 'perfil' ? 'settings' : 'login',
    );
  }
  if (key === 'configuracoes') {
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
  if (connectedAccount && devices.authorized()) {
    messages.ready();
    contacts.ready();
    statuses.ready();
    void vault.ready();
  }
  element('connection').textContent = navigator.onLine
    ? connectedAccount
      ? devices.authorized()
        ? 'Conta conectada'
        : 'Sessão conectada · abertura da conta em Configurações → Aparelhos'
      : 'Conexão disponível · nenhuma conta conectada'
    : 'Sem conexão · histórico salvo disponível neste aparelho';
}

if (!account.approvalPage) {
  conversationContent.dataset['messagesContainer'] = '';
  messages.mount(conversationContent, element('chat-directory'));
}
document
  .getElementById('open-search')
  ?.addEventListener('click', () => messages.openSearch());
document.getElementById('back-to-chats')?.addEventListener('click', () => {
  element('app-shell').dataset['chatOpen'] = 'false';
});
document
  .querySelector('[data-route=conversas]')
  ?.addEventListener('click', () => {
    element('app-shell').dataset['chatOpen'] = 'false';
  });
window.addEventListener('hashchange', route);
window.addEventListener('online', connection);
window.addEventListener('offline', connection);
route();
connection();
