// Manual browser fixture with synthetic account and local API responses only.
import { startPublicProfile } from '../../src/client/public-profile/index.ts';
import { startCommunities } from '../../src/client/communities/index.ts';
import { ExternalMediaConsent } from '../../src/client/external-media/index.ts';
import type { AccountSession } from '../../src/shared/account/index.ts';
import type {
  VaultAccess,
  VaultAuthority,
} from '../../src/client/vault-authority/index.ts';
import { VaultSync } from '../../src/client/vault-sync/index.ts';
const session: AccountSession = {
  accountId: crypto.randomUUID(),
  deviceId: crypto.randomUUID(),
  csrf: 'a'.repeat(64),
  name: 'Synthetic',
  address: '0x' + '1'.repeat(40),
  ecosystem: 'evm',
  deviceState: 'pending',
  historyAuthorized: false,
  expiresAt: '2027-01-01T00:00:00Z',
  profileRevision: 1,
  walletConfirmed: true,
};
const authority: VaultAuthority = {
  session,
  offline: false,
  directory: 'b'.repeat(64),
  epoch: 1,
  events: [],
  sign: () => Promise.resolve('synthetic-signature'),
  key: () => Promise.reject(new Error('No content key in this fixture')),
};
const access: VaultAccess = {
  withVault: (_, work) => work(authority),
  withLocalVault: (_, work) => work(authority),
};
const privacy = new ExternalMediaConsent({
  profile: () => Promise.resolve(false),
  storage: null,
});
privacy.setSession(session);
const mode =
  new URL(location.href).searchParams.get('mode') === 'community'
    ? 'community'
    : 'profile';
function mountFixture() {
  const host = document.querySelector<HTMLElement>('[data-fixture]');
  if (!host) throw new Error('Synthetic editor host missing.');
  if (mode === 'profile') {
    const ui = startPublicProfile(access, privacy);
    ui.setSession(session);
    ui.mount(host);
    return ui;
  }
  const ui = startCommunities(access, new VaultSync(access), privacy, {
    inspect: () => Promise.resolve(null),
    set: () =>
      Promise.resolve({ following: false, notify: false, revision: 0 }),
  });
  ui.setSession(session);
  ui.mount(
    host,
    null,
    new URLSearchParams({
      id: '11111111-1111-4111-a111-111111111111',
      view: 'manage',
    }),
  );
  return ui;
}
Object.assign(window, { fixture: { ui: mountFixture() } });
