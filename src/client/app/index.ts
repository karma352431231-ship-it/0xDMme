import { paintAvatar, startAppearance } from '../appearance/index.ts';
import { startPwa } from '../pwa/index.ts';
import { startAccount } from '../account/index.ts';
import { startDevices } from '../devices/index.ts';
import { MessageReadiness } from '../message-live/index.ts';
import { startBackups } from '../backups/index.ts';
import { startVault } from '../vault-ui/index.ts';
import { startMessages } from '../messages/index.ts';
import { startStatus } from '../status/index.ts';
import { startRepresentatives } from '../representatives/index.ts';
import { startContacts } from '../contacts/index.ts';
import { VoicePlayback } from '../voice-playback/index.ts';
import { CallLog, startCalls } from '../calls/index.ts';
import { startCommunities } from '../communities/index.ts';
import {
  startPublicProfile,
  showPublicProfile,
} from '../public-profile/index.ts';
import type { AccountSession } from '../../shared/account/index.ts';
import type { AddressBookEntry } from '../../shared/contacts/index.ts';
import {
  bindSettingsSections,
  pages,
  pageKey,
  startSettingsCategories,
} from './pages.ts';
import { startPanels } from './panels.ts';
import { startActivity } from '../activity/index.ts';
import { ExternalMediaConsent } from '../external-media/index.ts';
import type { PageKey } from './pages.ts';

function element<T extends HTMLElement>(id: string): T {
  const result = document.getElementById(id);
  if (!result) throw new Error('Interface incompleta.');
  return result as T;
}

// Theme first, so the first render already uses the saved device choice.
const appearance = startAppearance();
let connectedAccount: AccountSession | null = null;
const messageReadiness = new MessageReadiness();
const conversationContent = document.createElement('div');
conversationContent.className = 'conversation-content';
// Public @ conversations share the chat column with private ones; static markup only.
const publicChat = document.createElement('div');
publicChat.className = 'public-chat community-scope';
publicChat.innerHTML =
  '<div class="public-chat-bar"><span>Mensagem pública pelo @</span><button data-chat-collapse class="icon-button" type="button" aria-label="Recolher conversa" title="Recolher conversa"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12H9M13 7l-5 5 5 5M4 5v14"/></svg></button></div><div class="public-chat-body"></div>';
const publicChatBody = publicChat.lastElementChild as HTMLElement;
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
  panels?.privateChatOpened();
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
const externalMedia = new ExternalMediaConsent({
  profile: () => publicProfiles.exists(),
});
window.addEventListener('storage', (event) =>
  externalMedia.storageChanged(event.key),
);
const publicProfiles = startPublicProfile(devices, externalMedia);
const communities = startCommunities(devices, vault.sync, externalMedia);
const playback = new VoicePlayback();
const callLog = new CallLog(vault.sync);
const calls = startCalls({
  access: devices,
  sync: vault.sync,
  playback,
  before: () => messages.prepareCall(),
  label: (peer) => messages.callLabel(peer),
  history: {
    // A failed vault write keeps the call pending in memory, still listed and retried.
    missed: (call) => {
      void callLog
        .recordMissed(call)
        .catch(() => undefined)
        .finally(() => activity.refresh());
    },
    answered: (id) => {
      void callLog.recordAnswered(id).catch(() => undefined);
    },
  },
});
const backups = startBackups(devices, vault.sync, playback, {
  reminder: () => account.backupReminder(),
  confirmWallet: () => account.confirmWallet(),
  profile: () => account.backupProfile(),
});
const contacts = startContacts(devices, vault.sync, {
  saved: (contact) => messages.contactSaved(contact),
  open: (peer) => messages.openContact(peer),
});
const statuses = startStatus(devices, vault.sync);
const representatives = startRepresentatives(devices, vault.sync, (message) =>
  account.signStatement(message),
);
const messages = startMessages(devices, vault.sync, {
  externalMedia,
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
const activity = startActivity(
  {
    requests: () => contacts.incomingRequests(),
    respondRequest: (id, accept) => contacts.respondRequest(id, accept),
    groupInvites: () => messages.groupInvites(),
    respondGroupInvite: (id, accept) => messages.respondGroupInvite(id, accept),
    replies: () => communities.unreadReplies(),
    markRepliesRead: (ids) => communities.markRepliesRead(ids),
    transfers: () => communities.pendingTransfers(),
    missedCalls: async () =>
      (await callLog.missed()).map((call) => ({
        ...call,
        label: messages.callLabel(call.peer),
      })),
    clearMissedCalls: () => callLog.clear(),
  },
  {
    countChanged: (count) => {
      document
        .querySelectorAll<HTMLElement>('[data-activity-count]')
        .forEach((badge) => {
          badge.hidden = count === 0;
          badge.textContent = count > 99 ? '99+' : String(count);
        });
    },
  },
);
// Activity and status rings load once per authorized session, never on a timer.
let sessionExtrasFor = '';
const account = startAccount({
  mobileOpening: true,
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
    externalMedia.setSession(session);
    backups.setSession(session);
    contacts.setSession(session);
    messages.setSession(session);
    calls.setSession(session);
    statuses.setSession(session);
    representatives.setSession(session);
    publicProfiles.setSession(session);
    communities.setSession(session);
    activity.setSession(session);
    callLog.reset();
    if (!session) sessionExtrasFor = '';
    panels?.sessionChanged();
    connection();
    const label = document.getElementById('account-label');
    if (label)
      label.textContent = session
        ? session.name || 'Conta conectada'
        : 'Conta não conectada';
    railAvatar(session);
  },
});
// The standalone wallet document has no workspace panels. Identify it through
// the account controller before accessing elements exclusive to the app shell.
const panels = account.approvalPage
  ? null
  : startPanels({
      shell: element('app-shell'),
      feedBody: element('feed-body'),
      publicChat: publicChatBody,
      publicDirectory: element('public-directory'),
      communities: {
        mountFeed: (container, params) => {
          communities.mount(container, null, params);
        },
        leaveFeed: () => {
          communities.leave();
        },
        openDm: (container, id, local) => {
          communities.openDm(container, id, local);
        },
        closeDm: () => {
          communities.closeDm();
        },
        dmDirectory: (node, valid) => communities.dmDirectory(node, valid),
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
        extrasCanActivate(),
    });
function extrasCanActivate(): boolean {
  return activity.canActivate() && socialCanActivate();
}
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
  activity.leave();
  backups.leave();
  vault.leave();
  // Templates are static authored content. No user/server input enters HTML.
  element('page-content').innerHTML = page.content;
  if (key === 'conversas')
    element('page-content').append(conversationContent, publicChat);
  mountAccountPanels(key);
  mountFeature(key);
  element('workspace').scrollTop = 0;
  document
    .querySelectorAll<HTMLAnchorElement>('nav a[data-route]')
    .forEach((link) => {
      if (link.dataset['route'] === key)
        link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
  showAboutLinks();
  const button = document.getElementById('check-updates');
  button?.addEventListener('click', () => {
    void pwa?.check();
  });
  pwa?.render();
  // The approval route returned above, so workspace panels exist here.
  panels!.routed(key);
}
/** Build-time source and license links live in a template of the shell. */
function showAboutLinks(): void {
  const host = document.querySelector('[data-about-links]');
  const links = document.getElementById('about-app-links');
  if (host && links instanceof HTMLTemplateElement)
    host.replaceChildren(links.content.cloneNode(true));
}
function renderPageHeader(key: PageKey): void {
  const dm =
    key === 'comunidades' &&
    new URLSearchParams(location.hash.split('?')[1] ?? '').get('view') ===
      'dms';
  const title = dm ? 'Mensagens pelo @' : pages[key].title;
  element('page-title').textContent = title;
  // Phones name the screen in the top bar (the page heading is read, not shown).
  const mobileTitle = document.querySelector('[data-mobile-title]');
  if (mobileTitle) mobileTitle.textContent = title;
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
  const appearanceSettings = content.querySelector<HTMLElement>(
    '[data-appearance-settings]',
  );
  if (appearanceSettings) appearance.mount(appearanceSettings);
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
  const vaultSettings = content.querySelector<HTMLElement>(
    '[data-vault-settings]',
  );
  if (vaultSettings) mountVault(vaultSettings);
}
/** Same vault and backup cards as #cofre, now also inside Perfil → Cofre e backup. */
function mountVault(container: HTMLElement): void {
  vault.mount(container);
  const backupContainer = document.createElement('div');
  backupContainer.className = 'backup-card';
  container.after(backupContainer);
  backups.mount(backupContainer);
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
  if (key === 'conversas') {
    messages.ready();
    refreshStatusAuthors();
  }
  mountActivity(key, content);
  if (key === 'perfil')
    startSettingsCategories(
      content,
      bindSettingsSections(content, (id) => {
        if (id === 'devices') devices.stopCamera();
      }),
    );
  mountStatusFeature(key, content);
  const contactContainer = content.querySelector<HTMLElement>(
    '[data-contacts-container]',
  );
  if (key === 'contatos' && contactContainer) contacts.mount(contactContainer);
  const vaultContainer = content.querySelector<HTMLElement>(
    '[data-vault-container]',
  );
  if (key === 'cofre' && vaultContainer) mountVault(vaultContainer);
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

function mountActivity(key: PageKey, content: HTMLElement): void {
  const container = content.querySelector<HTMLElement>('[data-activity]');
  if (key === 'atividade' && container) activity.mount(container);
}

function mountStatusFeature(key: PageKey, content: HTMLElement): void {
  const container = content.querySelector<HTMLElement>(
    '[data-status-container]',
  );
  if (key === 'status' && container)
    statuses.mount(
      container,
      new URLSearchParams(location.hash.split('?')[1] ?? '').get('autor'),
    );
}

function mountAccountPanels(key: PageKey): void {
  if (key === 'publico' || key === 'comunidades') return;
  const container = document.createElement('div');
  container.className = 'account-section';
  element('page-content').prepend(container);
  account.mount(container, key === 'perfil' ? 'settings' : 'login');
  if (key !== 'perfil') return;
  const meter = document.createElement('div');
  meter.className = 'vault-meter';
  container.after(meter);
  vault.mountMeter(meter);
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
  const messagesReady = messageReadiness.update(
    connectedAccount,
    devices.authorized(),
  );
  if (connectedAccount && devices.authorized()) {
    publicProfiles.ready();
    communities.ready();
    if (messagesReady) messages.ready();
    calls.ready();
    contacts.ready();
    statuses.ready();
    void vault.ready();
    loadSessionExtras(connectedAccount.accountId);
  }
  element('connection').textContent = navigator.onLine
    ? connectedAccount
      ? devices.authorized()
        ? 'Conta conectada'
        : 'Sessão conectada · abertura da conta em Perfil → Aparelhos'
      : 'Conexão disponível · nenhuma conta conectada'
    : 'Sem conexão · histórico salvo disponível neste aparelho';
}

/** Initials on the rail profile link; the photo stays in Perfil. */
function railAvatar(session: AccountSession | null): void {
  const avatar = document.querySelector<HTMLElement>('[data-rail-avatar]');
  if (!avatar) return;
  if (!session) {
    avatar.textContent = '#';
    delete avatar.dataset['tone'];
    return;
  }
  paintAvatar(avatar, {
    label: session.name || session.address,
    seed: session.address,
  });
}

function loadSessionExtras(accountId: string): void {
  if (sessionExtrasFor === accountId) return;
  sessionExtrasFor = accountId;
  void activity.refresh();
  refreshStatusAuthors(true);
}
let statusAuthorsAt = 0;
/** Rings and the status row; at most once a minute when returning to Conversas. */
function refreshStatusAuthors(force = false): void {
  if (!connectedAccount || !devices.authorized()) return;
  if (!force && Date.now() - statusAuthorsAt < 60_000) return;
  statusAuthorsAt = Date.now();
  // Decoration: if the status list fails, the list simply shows none.
  statuses
    .activeAuthors()
    .then((authors) => {
      messages.statusesChanged(authors);
    })
    .catch(() => {
      messages.statusesChanged(new Set());
    });
}

if (!account.approvalPage) {
  conversationContent.dataset['messagesContainer'] = '';
  messages.mount(conversationContent, element('chat-directory'));
}
document
  .querySelectorAll('#open-search, [data-open-search]')
  .forEach((control) => {
    control.addEventListener('click', () => {
      messages.openSearch();
    });
  });
// "/" opens the conversation search unless the person is typing somewhere.
document.addEventListener('keydown', (event) => {
  const target = event.target;
  if (
    event.key !== '/' ||
    event.ctrlKey ||
    event.metaKey ||
    event.altKey ||
    (target instanceof HTMLElement &&
      (target.isContentEditable ||
        ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)))
  )
    return;
  event.preventDefault();
  messages.openSearch();
});
conversationContent.addEventListener('click', (event) => {
  if (
    event.target instanceof Element &&
    event.target.closest('[data-chat-back]')
  ) {
    element('app-shell').dataset['chatOpen'] = 'false';
    messages.viewChanged();
  }
});
document
  .querySelector('[data-route=conversas]')
  ?.addEventListener('click', () => {
    element('app-shell').dataset['chatOpen'] = 'false';
    messages.viewChanged();
  });
window.addEventListener('hashchange', route);
window.addEventListener('online', connection);
window.addEventListener('offline', connection);
route();
connection();
