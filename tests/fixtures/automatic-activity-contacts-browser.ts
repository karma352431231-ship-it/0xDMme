import { startContacts, Contacts } from '../../src/client/contacts/index.ts';
import { startActivity } from '../../src/client/activity/index.ts';
import { VaultSync } from '../../src/client/vault-sync/index.ts';
import type { VaultEntry } from '../../src/client/vault-sync/index.ts';
import type { VaultAccess } from '../../src/client/vault-authority/index.ts';
import type { AccountSession } from '../../src/shared/account/index.ts';
import { setActiveLanguage } from '../../src/shared/i18n/index.ts';

const session: AccountSession = {
  accountId: '11111111-1111-4111-a111-111111111111',
  deviceId: '22222222-2222-4222-a222-222222222222',
  ecosystem: 'evm',
  address: '0x' + '1'.repeat(40),
  name: 'Synthetic owner',
  csrf: 'c'.repeat(64),
  profileRevision: 0,
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
  walletConfirmed: true,
  deviceState: 'pending',
  historyAuthorized: false,
};
const peer = {
  accountId: '33333333-3333-4333-a333-333333333333',
  ecosystem: 'evm' as const,
  address: '0x' + 'a'.repeat(40),
  name: 'Synthetic contact',
  requester: session.accountId,
};
const authority: VaultAccess = {
  withVault: () => Promise.reject(new Error('Synthetic UI transport only.')),
  withLocalVault: () =>
    Promise.reject(new Error('Synthetic UI transport only.')),
};
const sync = new VaultSync(authority);
sync.complete = true;
const heads = new Map<string, VaultEntry[]>(),
  values = new Map<string, string>();
sync.currentHeads = () => heads;
sync.heads = (entity) => heads.get(entity) ?? [];
sync.isRemoved = () => false;
sync.openLocal = () => Promise.resolve();
sync.refresh = () => Promise.resolve();
sync.open = (id) => Promise.resolve(values.get(id)!);
sync.save = (input) => {
  const id = crypto.randomUUID();
  const entry: VaultEntry = {
    change: input.change,
    commit: {
      version: 1,
      id,
      accountId: session.accountId,
      deviceId: session.deviceId,
      directory: 'a'.repeat(64),
      authorityRevision: 1,
      epoch: 1,
      sequence: values.size + 1,
      previous: null,
      block: { hash: 'a'.repeat(64), bytes: 32 },
      manifest: { iv: '', ciphertext: '' },
      signature: '',
    },
  };
  values.set(id, input.value);
  sync.entries.set(id, entry);
  heads.set(input.change.entity, [entry]);
  return Promise.resolve();
};
let revision = 0,
  outgoing = false,
  approved = false,
  incoming = false;
function api(operation: string, payload: Record<string, unknown>): unknown {
  const state = { revision, mode: 'invite', inviteHash: null };
  switch (operation) {
    case 'state':
      return state;
    case 'snapshot':
      return {
        state,
        lists: {
          incoming: {
            items: incoming ? [{ ...peer, requester: peer.accountId }] : [],
            next: null,
          },
          outgoing: { items: outgoing ? [peer] : [], next: null },
          approved: { items: approved ? [peer] : [], next: null },
          blocked: { items: [], next: null },
          rejected: { items: [], next: null },
        },
      };
    case 'discover':
      return {
        accountId: peer.accountId,
        ecosystem: peer.ecosystem,
        address: peer.address,
        name: peer.name,
      };
    case 'request':
      outgoing = true;
      revision++;
      return { saved: true };
    case 'cancel':
      outgoing = false;
      revision++;
      return { saved: true };
    default:
      throw new Error(
        `Unexpected synthetic operation: ${operation} ${Object.keys(payload).join(',')}`,
      );
  }
}
Contacts.prototype.api = (operation, payload) =>
  Promise.resolve(api(operation, payload));
setActiveLanguage(
  new URL(location.href).searchParams.get('language') === 'zh-CN'
    ? 'zh-CN'
    : 'en',
);
const root = document.querySelector<HTMLElement>('[data-fixture]')!;
const contactsHost = document.createElement('section'),
  activityHost = document.createElement('section'),
  badge = document.createElement('span');
badge.dataset['fixtureBadge'] = '';
root.append(badge, contactsHost, activityHost);
const contacts = startContacts(authority, sync, {
  open: () => Promise.resolve(),
});
contacts.setSession(session);
contacts.mount(contactsHost);
const replies: {
  reply: string;
  community: string;
  createdAt: string;
  preview: null;
}[] = [];
const activity = startActivity(
  {
    requests: () => contacts.incomingRequests(),
    respondRequest: () => Promise.resolve(),
    groupInvites: () => Promise.resolve([]),
    respondGroupInvite: () => Promise.resolve(),
    replies: () => Promise.resolve([...replies]),
    markRepliesRead: () => Promise.resolve(),
    transfers: () => Promise.resolve([]),
    missedCalls: () => Promise.resolve([]),
    clearMissedCalls: () => Promise.resolve(),
  },
  {
    countChanged: (count) => {
      badge.textContent = String(count);
    },
  },
);
activity.setSession(session);
activity.ready();
Object.assign(window, {
  notificationContactsFixture: {
    requestIncoming() {
      incoming = true;
      revision++;
      activity.event('changed');
    },
    reply() {
      replies.push({
        reply: crypto.randomUUID(),
        community: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        preview: null,
      });
      activity.event('changed');
    },
    acceptOutgoing() {
      outgoing = false;
      approved = true;
      revision++;
      activity.event('changed');
    },
    reloadContacts() {
      contacts.mount(contactsHost);
    },
    openActivity() {
      activity.mount(activityHost);
    },
    repeat() {
      activity.event('changed');
    },
    close() {
      activity.setSession(null);
      contacts.setSession(null);
    },
  },
});
