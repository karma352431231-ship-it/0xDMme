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
import { startCalls } from '../calls/index.ts';
import { startCommunities } from '../communities/index.ts';
import {
  startPublicProfile,
  showPublicProfile,
} from '../public-profile/index.ts';
import type { AccountSession } from '../../shared/account/index.ts';
import type { AddressBookEntry } from '../../shared/contacts/index.ts';
import { pages, pageKey } from './pages.ts';
import type { PageKey } from './pages.ts';

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
let closePublicProfile: (() => void) | null = null;
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
    publicProfiles.ready();
    communities.ready();
    connection();
  },
  linked: (session) => account.acceptLinkedSession(session),
  confirmWallet: () => account.confirmWallet(),
});
const vault = startVault(devices);
const publicProfiles = startPublicProfile(devices);
const communities = startCommunities(devices, vault.sync);
const playback = new VoicePlayback();
const calls = startCalls({
  access: devices,
  sync: vault.sync,
  playback,
  before: () => messages.prepareCall(),
  label: (peer) => messages.callLabel(peer),
});
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
  calls,
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
  liveEvent: (event) => {
    statuses.event(event);
    calls.event(event);
  },
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
    calls.setSession(session);
    statuses.setSession(session);
    representatives.setSession(session);
    publicProfiles.setSession(session);
    communities.setSession(session);
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
        !calls.active() &&
        statuses.canActivate() &&
        representatives.canActivate() &&
        socialCanActivate(),
    });
function socialCanActivate(): boolean {
  return publicProfiles.canActivate() && communities.canActivate();
}

function route(): void {
  if (account.approvalPage) {
    renderApprovalPage();
    return;
  }
  const key = pageKey(location.hash);
  if (key === null) return;
  if (
    currentPage === key &&
    (currentHash === location.hash || key === 'perfil')
  ) {
    // Account handles wallet-return fragments; keep profile drafts/camera mounted.
    currentHash = location.hash;
    return;
  }
  currentPage = key;
  currentHash = location.hash;
  element('app-shell').dataset['page'] = key;
  const page = pages[key];
  renderPageHeader(key);
  messages.leave();
  statuses.leave();
  representatives.leave();
  publicProfiles.leave();
  communities.leave();
  closePublicProfile?.();
  closePublicProfile = null;
  backups.leave();
  vault.leave();
  // Templates are static authored content. No user/server input enters HTML.
  element('page-content').innerHTML = page.content;
  if (key === 'conversas') element('page-content').append(conversationContent);
  mountAccountPanels(key);
  mountFeature(key);
  element('workspace').scrollTop = 0;
  document.querySelectorAll<HTMLAnchorElement>('nav a').forEach((link) => {
    if (link.dataset['route'] === key)
      link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  const button = document.getElementById('check-updates');
  button?.addEventListener('click', () => {
    void pwa?.check();
  });
  pwa?.render();
}
function renderPageHeader(key: PageKey): void {
  const dm =
    key === 'comunidades' &&
    new URLSearchParams(location.hash.split('?')[1] ?? '').get('view') ===
      'dms';
  const title = dm ? 'Mensagens pelo @' : pages[key].title;
  element('page-title').textContent = title;
  element('breadcrumb').textContent = title.toLocaleUpperCase('pt-BR');
  element('page-phase').textContent = dm
    ? 'DMs individuais · E2EE'
    : key === 'publico'
      ? 'Perfil público · Leitura aberta'
      : key === 'comunidades'
        ? 'Comunidades · Leitura aberta'
        : 'Conta EVM / Solana · Mensagens privadas';
  document.title = `${title} · 0xDMme`;
}
function mountProfileSettings(content: HTMLElement): void {
  const dailyContainer = content.querySelector<HTMLElement>(
    '[data-daily-settings]',
  );
  if (dailyContainer) messages.mountSettings(dailyContainer);
  const callSettings = content.querySelector<HTMLElement>(
    '[data-call-settings]',
  );
  if (callSettings) calls.mountSettings(callSettings);
  const representativeContainer = content.querySelector<HTMLElement>(
    '[data-representatives-settings]',
  );
  if (representativeContainer)
    representatives.mountSettings(representativeContainer);
  const contactSettings = content.querySelector<HTMLElement>(
    '[data-contact-settings-container]',
  );
  if (contactSettings) contacts.mount(contactSettings, 'settings');
  const deviceSettings = content.querySelector<HTMLElement>(
    '[data-device-settings]',
  );
  if (deviceSettings) devices.mount(deviceSettings);
}

function mountFeature(key: PageKey): void {
  const content = element('page-content');
  mountProfileSettings(content);
  mountPublicProfiles(content);
  const communityContainer =
    content.querySelector<HTMLElement>('[data-communities]');
  if (communityContainer)
    communities.mount(
      communityContainer,
      element('community-directory'),
      new URLSearchParams(location.hash.split('?')[1] ?? ''),
    );
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
function mountPublicProfiles(content: HTMLElement): void {
  const own = content.querySelector<HTMLElement>(
    '[data-public-profile-settings]',
  );
  if (own) publicProfiles.mount(own);
  const view = content.querySelector<HTMLElement>('[data-public-profile-view]');
  if (view)
    closePublicProfile = showPublicProfile(
      view,
      new URLSearchParams(location.hash.split('?')[1] ?? '').get('handle'),
    );
}

function mountStatusFeature(key: PageKey, content: HTMLElement): void {
  const container = content.querySelector<HTMLElement>(
    '[data-status-container]',
  );
  if (key === 'status' && container) statuses.mount(container);
}

function mountAccountPanels(key: PageKey): void {
  if (key === 'publico' || key === 'comunidades') return;
  const container = document.createElement('div');
  container.className = 'account-section';
  element('page-content').prepend(container);
  account.mount(container, key === 'perfil' ? 'settings' : 'login');
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
    publicProfiles.ready();
    communities.ready();
    messages.ready();
    calls.ready();
    contacts.ready();
    statuses.ready();
    void vault.ready();
  }
  element('connection').textContent = navigator.onLine
    ? connectedAccount
      ? devices.authorized()
        ? 'Conta conectada'
        : 'Sessão conectada · abertura da conta em Perfil → Aparelhos'
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
