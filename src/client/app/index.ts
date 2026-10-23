import {
  appAddress,
  navigateApp,
  startAppNavigation,
} from '../app-navigation/index.ts';
import { t, currentLanguage } from '../../shared/i18n/index.ts';
import {
  canonicalAppHash,
  routeParams,
} from '../../shared/app-routes/index.ts';
import { mountPublicSearch } from '../public-search/index.ts';
import { startGroupEntrypoints } from './group-entrypoints.ts';
import { startAppearance } from '../appearance/index.ts';
import { startPwa } from '../pwa/index.ts';
import { updateBlockReason } from './update-readiness.ts';
import { keepPageOnStrayDrop } from '../file-drop/index.ts';
import { startTransientMenus } from '../transient-menu/index.ts';
import { startScrollbarFade } from '../scrollbars/index.ts';
import { startAccount } from '../account/index.ts';
import {
  startDevices,
  startEnrollmentEntry,
  mountEnrollmentLogin,
} from '../devices/index.ts';
import { MessageReadiness } from '../message-live/index.ts';
import { startBackups } from '../backups/index.ts';
import { startVault } from '../vault-ui/index.ts';
import { startMessages } from '../messages/index.ts';
import { startStatus } from '../status/index.ts';
import { startRepresentatives } from '../representatives/index.ts';
import { bindContactShortcuts, startContacts } from '../contacts/index.ts';
import { VoicePlayback } from '../voice-playback/index.ts';
import { CallLog, startCalls } from '../calls/index.ts';
import { startCommunities, startRankingSide } from '../communities/index.ts';
import { startRightColumn } from './right-column.ts';
import { startPublicProfile } from '../public-profile/index.ts';
import type { AccountSession } from '../../shared/account/index.ts';
import type { AddressBookEntry } from '../../shared/contacts/index.ts';
import {
  bindSettingsSections,
  openSettingsSection,
  pages,
  pageKey,
  pageContent,
  profileSessionChanged,
  requestedSettingsSection,
  startSettingsCategories,
} from './pages.ts';
import { startPanels } from './panels.ts';
import { startMobileConversation } from './mobile-conversation.ts';
import { startConversationBadges } from './conversation-badges.ts';
import { startActivity } from '../activity/index.ts';
import { ExternalMediaConsent } from '../external-media/index.ts';
import { startAccountSettings } from './account-settings.ts';
import type { PageKey } from './pages.ts';
import { mountLanguageSettings, startLanguage } from '../language/index.ts';
import { SessionBoot } from './session-boot.ts';
import { NavigationVisits } from './navigation-visits.ts';

function element<T extends HTMLElement>(id: string): T {
  const result = document.getElementById(id);
  if (!result) throw new Error('Interface incomplete.');
  return result as T;
}

// A file dropped outside a composer must not navigate away from the app.
startLanguage();
keepPageOnStrayDrop();
startTransientMenus();
startScrollbarFade();
// Theme first, so the first render already uses the saved device choice.
const appearance = startAppearance();
let connectedAccount: AccountSession | null = null;
let recheckingAccount = false;
const messageReadiness = new MessageReadiness();
const conversationContent = document.createElement('div');
conversationContent.className = 'conversation-content';
// Public @ conversations share the chat column with private ones; static markup only.
const publicChat = document.createElement('div');
publicChat.className = 'public-chat community-scope';
publicChat.innerHTML = t('html.6b9c4f752db1');
document
  .querySelectorAll<HTMLElement>('[data-public-search]')
  .forEach((host) => mountPublicSearch(host, new AbortController().signal));
const publicChatBody = publicChat.lastElementChild as HTMLElement;
let currentPage = '';
const navigationVisits = new NavigationVisits();
let currentHash = '';
let profileAuthenticated = false;
let closePublicProfile: (() => void) | null = null;
function openConversation(): void {
  mobileConversation?.open();
  if (pageKey(appAddress()) !== 'conversas') {
    navigateApp('#chats');
  }
  route();
  element('app-shell').dataset['chatOpen'] = 'true';
  rightColumn?.showChat();
  element('workspace').scrollTop = 0;
  panels?.privateChatOpened();
}
const devices = startDevices({
  changed: async () => {
    // Session and key callbacks also call connection(). Publish panel readiness
    // once, after the complete device/profile recheck, including dirty profiles.
    recheckingAccount = true;
    try {
      await account.refreshPrivate();
    } finally {
      recheckingAccount = false;
    }
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
const publicProfiles = startPublicProfile(
  devices,
  externalMedia,
  (host, detail, signal) => communities.previewModeration(host, detail, signal),
);
const conversationBadgeHost = document.getElementById('app-shell');
const conversationBadge = conversationBadgeHost
  ? startConversationBadges(conversationBadgeHost)
  : () => {};
const communities = startCommunities(devices, vault.sync, externalMedia, {
  profiles: publicProfiles.follows,
  publicProfile: () => publicProfiles.exists(),
  unreadChanged: (count) => conversationBadge('public', count),
  // Public DMs start from SessionBoot below; the feed uses the signing lane.
  coordinatedStartup: true,
});
// Ranking beside the feed and the Chat | Communities switch (16/10/2026).
// The wallet approval document has no app shell and gets neither.
const appShell = document.getElementById('app-shell');
const rankingSide = appShell
  ? startRankingSide({
      shell: appShell,
      access: devices,
      signedIn: () => connectedAccount !== null,
      scopeChanged: (scope) => rightColumn?.followRanking(scope),
    })
  : null;
const rightColumn =
  appShell && rankingSide
    ? startRightColumn({
        shell: appShell,
        showRanking: (scope) => {
          rankingSide.showScope(scope);
          rankingSide.refresh();
        },
      })
    : null;
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
// The wallet approval document has no contacts editor.
const contactEditorHost = document.getElementById('contact-editor-host');
if (contactEditorHost) contacts.mountEditor(contactEditorHost);
bindContactShortcuts(document, () => contacts.addContact());
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
    contacts.showContact(contact, element('app-shell'));
  },
  addContact: (wallet, alias) =>
    contacts.addContact({ address: wallet.address, alias }),
  directoryChanged: (available) => {
    const shell = document.getElementById('app-shell');
    if (shell) shell.dataset['history'] = available ? 'available' : 'empty';
  },
  unreadChanged: (count) => conversationBadge('private', count),
  directorySettled: (session) => sessionBoot.settled(session),
  representatives,
  liveEvent: (event) => {
    communities.dmEvent(event);
    calls.event(event);
    if (event === 'call') return;
    statuses.event(event);
    activity.event(event);
  },
  liveState: (connected) => statuses.liveConnection(connected),
  sharedProfile: () => account.sharedProfile(),
  preferences: () => account.privacyPreferences(),
});
const groupEntrypoints = startGroupEntrypoints({
  available: () => !!connectedAccount && devices.authorized(),
  create: () => messages.createGroup(),
  join: (url) => messages.joinGroup(url),
});
const activity = startActivity(
  {
    requests: () => contacts.incomingRequests(),
    respondRequest: (id, accept) => contacts.respondRequest(id, accept),
    groupInvites: () => messages.groupInvites(),
    respondGroupInvite: (id, accept) => messages.respondGroupInvite(id, accept),
    replies: () => communities.publicationNotifications(),
    markRepliesRead: (ids) => communities.markRepliesRead(ids),
    upvotes: () => communities.upvoteNotifications(),
    markUpvotesRead: (ids) => communities.markUpvotesRead(ids),
    transfers: () => communities.pendingTransfers(),
    moderation: () => publicProfiles.moderationNotifications(),
    mentions: () => publicProfiles.mentionNotifications(),
    markMentionsRead: (ids) => publicProfiles.markMentionsRead(ids),
    markModerationRead: (ids) => {
      publicProfiles.markModerationRead(ids);
      return Promise.resolve();
    },
    missedCalls: async () =>
      (await callLog.missed()).map((call) => ({
        ...call,
        label: messages.callLabel(call.peer),
      })),
    clearMissedCalls: () => callLog.clear(),
  },
  {
    externalMedia,
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
const accountSettings = startAccountSettings({
  languageBlocked: interruptionReason,
  access: devices,
  sync: vault.sync,
  appearance,
  externalMedia,
  account: {
    privacyPreferences: () => account.privacyPreferences(),
    backupReminder: () => account.backupReminder(),
    savePrivacy: (changes) => account.savePrivacy(changes),
  },
  contacts,
});
// Optional session warmups follow the foreground private directory's first load.
const sessionBoot = new SessionBoot((session) => {
  publicProfiles.ready();
  communities.sessionReady();
  contacts.ready();
  activity.ready();
  statuses.ready();
  void vault.ready();
  loadSessionExtras(session.accountId);
  if (!account.approvalPage) accountSettings.ready();
});
// Status rings load once per authorized session; activity has its own wakeups.
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
    navigationVisits.setSession(session);
    connectedAccount = session;
    sessionBoot.setSession(session);
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
    accountSettings.setSession(session);
    messages.setSession(session);
    calls.setSession(session);
    statuses.setSession(session);
    representatives.setSession(session);
    setPublicSession(session);
    activity.setSession(session);
    callLog.reset();
    if (!session) sessionExtrasFor = '';
    panels?.sessionChanged();
    connection();
    const label = document.getElementById('account-label');
    if (label)
      label.textContent = session
        ? session.name || t('Account connected')
        : t('No account connected');
    if (profileSessionChanged(currentPage, profileAuthenticated, !!session)) {
      currentPage = '';
      route();
    }
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
          communities.pause();
        },
        openDm: (container, id, local) => {
          communities.openDm(container, id, local);
        },
        closeDm: () => {
          communities.closeDm();
        },
        dmDirectory: (node, valid) => communities.dmDirectory(node, valid),
        showProfile: (container, handle) =>
          publicProfiles.show(
            container,
            handle,
            communities.feedReturnTarget(),
          ),
      },
      publicChatOpened: () => rightColumn?.showChat(),
    });
// Approval HTML is loaded online and does not install or activate a shell.
const pwa = account.approvalPage
  ? null
  : startPwa({
      waitForIdle: true,
      blockedReason: interruptionReason,
    });

function interruptionReason(): string | null {
  return updateBlockReason({
    authenticated: () => !!connectedAccount,
    account,
    devices,
    vault,
    backups,
    contacts,
    messages,
    statuses,
    representatives,
    activity,
    publicProfiles,
    communities,
    calls,
  });
}

/** Every page feature releases its view before the next page mounts. */
function leaveFeatures(next: PageKey): void {
  messages.leave();
  statuses.leave();
  representatives.leave();
  publicProfiles.leave();
  communities.leave();
  if (next !== 'comunidades') communities.forgetReturn();
  closePublicProfile?.();
  closePublicProfile = null;
  activity.leave();
  backups.leave();
  vault.leave();
}
function canonicalizeRoute(): void {
  const canonical = canonicalAppHash(appAddress());
  if (canonical && canonical !== appAddress())
    history.replaceState(null, '', canonical);
}
function updateMountedPage(key: PageKey): boolean {
  if (currentPage !== key) return false;
  if (key === 'perfil') {
    openSettingsSection(
      element('page-content'),
      requestedSettingsSection(appAddress()),
    );
    return true;
  }
  if (key === 'conversas') {
    if (currentHash !== appAddress()) panels?.routed(key);
    return true;
  }
  return currentHash === appAddress();
}
function route(): void {
  if (account.approvalPage) {
    renderApprovalPage();
    return;
  }
  canonicalizeRoute();
  const key = pageKey(appAddress());
  if (key === null) return;
  if (key !== 'conversas') sessionBoot.release();
  if (updateMountedPage(key)) {
    // Account handles wallet-return fragments; keep profile drafts/camera mounted.
    currentHash = appAddress();
    return;
  }
  navigationVisits.save(
    currentPage,
    element('page-content'),
    element('workspace'),
  );
  if (currentPage !== key) communities.pause();
  currentPage = key;
  currentHash = appAddress();
  element('app-shell').dataset['page'] = key;
  renderPageHeader(key);
  leaveFeatures(key);
  // Templates are static authored content. No user/server input enters HTML.
  profileAuthenticated = !!connectedAccount;
  element('page-content').innerHTML = pageContent(key, profileAuthenticated);
  if (key === 'contatos')
    navigationVisits.restoreContacts(element('page-content'));
  if (key === 'conversas')
    element('page-content').append(conversationContent, publicChat);
  mountAccountPanels(key);
  mountFeature(key);
  navigationVisits.restorePosition(key, element('workspace'));
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
    key === 'comunidades' && routeParams(appAddress()).get('view') === 'dms';
  const title = dm ? t('Handle messages') : pages[key].title;
  element('page-title').textContent = title;
  // Phones name the screen in the top bar (the page heading is read, not shown).
  const mobileTitle = document.querySelector('[data-mobile-title]');
  if (mobileTitle) mobileTitle.textContent = title;
  element('breadcrumb').textContent =
    title.toLocaleUpperCase(currentLanguage());
  element('page-phase').textContent = dm
    ? t('Individual DMs · E2EE')
    : key === 'publico'
      ? t('Public profile · Open access')
      : key === 'comunidades'
        ? t('Communities · Open access')
        : t('EVM / Solana account · Private messages');
  document.title = t('{0} · 0xDMme', [title]);
}
function mountProfileSettings(content: HTMLElement): void {
  const privacySettings = content.querySelector<HTMLElement>(
    '[data-privacy-settings]',
  );
  if (privacySettings) account.mountPrivacy(privacySettings);
  const appearanceSettings = content.querySelector<HTMLElement>(
    '[data-appearance-settings]',
  );
  if (appearanceSettings) {
    appearance.mount(appearanceSettings);
    // Language sits with the theme under "Appearance and language" (16/10/2026).
    mountLanguageSettings(
      appearanceSettings,
      (language) => accountSettings.saveLanguage(language),
      interruptionReason,
    );
  }
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
/** Same vault and backup cards as #vault, now also inside Profile → Vault and backup. */
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
      routeParams(appAddress()),
    );
  if (key === 'conversas') {
    messages.resume();
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
  const review = content.querySelector<HTMLElement>('[data-moderation-review]');
  if (review)
    publicProfiles.mountReview(review, routeParams(appAddress()).get('id'));
  const view = content.querySelector<HTMLElement>('[data-public-profile-view]');
  if (view)
    closePublicProfile = publicProfiles.show(
      view,
      routeParams(appAddress()).get('handle') ??
        routeParams(appAddress()).get('id'),
      communities.feedReturnTarget(),
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
    statuses.mount(container, routeParams(appAddress()).get('autor'));
}

function mountAccountPanels(key: PageKey): void {
  if (key === 'publico' || key === 'comunidades') return;
  const container = document.createElement('div');
  container.className = 'account-section';
  element('page-content').prepend(container);
  account.mount(
    container,
    key === 'perfil' && connectedAccount ? 'settings' : 'login',
  );
  if (!connectedAccount) {
    mountEnrollmentLogin(container, devices);
    return;
  }
  if (key !== 'perfil') return;
  const meter = document.createElement('div');
  meter.className = 'vault-meter';
  container.after(meter);
  vault.mountMeter(meter);
}

function renderApprovalPage(): void {
  element('page-title').textContent = t('Confirm signature');
  element('breadcrumb').textContent = t('ACCOUNT');
  const container = document.createElement('div');
  element('page-content').replaceChildren(container);
  account.mount(container);
  document.title = t('Confirm signature · 0xDMme');
}

function connection(): void {
  if (recheckingAccount) {
    renderConnection();
    return;
  }
  const messagesReady = messageReadiness.update(
    connectedAccount,
    devices.authorized(),
  );
  if (connectedAccount && devices.authorized()) {
    sessionBoot.update(connectedAccount, {
      directoryStarting: messagesReady,
      prioritizeDirectory:
        pageKey(appAddress()) === 'conversas' &&
        appShell?.dataset['contactScope'] !== 'public',
    });
    if (messagesReady) messages.ready();
    calls.ready();
    groupEntrypoints.ready();
  } else sessionBoot.reset();
  renderConnection();
}
function renderConnection(): void {
  element('connection').textContent = navigator.onLine
    ? connectedAccount
      ? devices.authorized()
        ? t('Account connected')
        : t('Session connected · open account in Profile → Devices')
      : t('Connection available · no account connected')
    : t('Offline · saved history available on this device');
}

function loadSessionExtras(accountId: string): void {
  if (sessionExtrasFor === accountId) return;
  sessionExtrasFor = accountId;
  activity.ready();
  refreshStatusAuthors(true);
}
let statusAuthorsAt = 0;
/** Rings and the status row; at most once a minute when returning to Chats. */
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
    if (mobileConversation?.close()) return;
    element('app-shell').dataset['chatOpen'] = 'false';
    messages.viewChanged();
  }
});
document.querySelectorAll('[data-route=conversas]').forEach((link) =>
  link.addEventListener('click', () => {
    if (mobileConversation?.close()) return;
    element('app-shell').dataset['chatOpen'] = 'false';
    messages.viewChanged();
  }),
);
if (!account.approvalPage)
  startAppNavigation(() => {
    currentHash = appAddress();
    panels?.canonicalized(currentHash);
  });
const mobileConversation = account.approvalPage
  ? null
  : startMobileConversation({
      shell: element('app-shell'),
      scope: (scope) => panels?.setContactScope(scope),
      changed: () => messages.viewChanged(),
    });
window.addEventListener('hashchange', () => {
  contacts.closeContact();
  route();
  mobileConversation?.restore();
});
window.addEventListener('online', connection);
window.addEventListener('offline', connection);
startEnrollmentEntry(devices);
route();
mobileConversation?.restore();
connection();

function setPublicSession(session: AccountSession | null): void {
  publicProfiles.setSession(session);
  communities.setSession(session);
  rankingSide?.setSession(session);
}
