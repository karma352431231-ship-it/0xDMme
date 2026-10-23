import { object, uuid } from '../../shared/account/index.ts';
import {
  canonical,
  digest,
  eventHash,
  sign,
  verifyHistory,
} from '../../shared/devices/index.ts';
import type { DirectoryEvent } from '../../shared/devices/index.ts';
import {
  socialDeviceName,
  socialDeviceNames,
  socialDirectory,
} from '../../shared/social-dm/index.ts';
import {
  aesKey,
  createRecovery,
  deviceSecrets,
  recoverSecrets,
} from '../device-keys/index.ts';
import {
  freshKeyring,
  prepareEvent,
  remainingIdentities,
} from '../device-operations/index.ts';
import {
  localIdentity,
  nameIdentity,
  readCheckpoint,
  saveCheckpoint,
} from '../device-storage/index.ts';
import type { VaultAuthority } from '../vault-authority/index.ts';
export type SocialApi = (
  operation: string,
  payload: Record<string, unknown>,
) => Promise<unknown>;
export interface SocialDirectoryPage {
  profile: string;
  events: DirectoryEvent[];
  device: string | null;
  active: string[] | null;
}

export async function readSocialDirectory(
  api: SocialApi,
  peer: string | null,
): Promise<SocialDirectoryPage> {
  const events: DirectoryEvent[] = [];
  let result: SocialDirectoryPage | null = null;
  for (let page = 0; page < 16; page++) {
    const raw = directoryPage(
      await api('directory', { peer, after: events.length }),
    );
    const profile = raw.profile;
    if (peer !== null && profile !== peer)
      throw new Error('Directory belongs to another public profile.');
    events.push(...raw.events);
    result = {
      profile,
      events,
      device: raw.device,
      active: raw.active,
    };
    if (raw.next === null) break;
    if (page === 15) throw new Error('DM directory exceeds the limit.');
  }
  if (!result) throw new Error('DM directory missing.');
  await pinSocialDirectory(result);
  return result;
}
function directoryPage(input: unknown) {
  const raw = object(input);
  if (
    !Array.isArray(raw['events']) ||
    raw['events'].length > 8 ||
    (raw['next'] !== null && !raw['events'].length)
  )
    throw new Error('Invalid DM directory page.');
  return {
    profile: uuid(raw['profile']),
    events: raw['events'].map(socialDirectory),
    device: raw['device'] === null ? null : uuid(raw['device']),
    active: raw['active'] === null ? null : activeAliases(raw['active']),
    next: raw['next'],
  };
}
function activeAliases(input: unknown): string[] {
  if (!Array.isArray(input) || input.length > 32)
    throw new Error('Invalid DM devices.');
  return input.map(uuid);
}
async function pinSocialDirectory(result: SocialDirectoryPage): Promise<void> {
  const old = await readCheckpoint(result.profile);
  if (old.events.length > result.events.length)
    throw new Error('DM directory rolled back.');
  await pinSocialHistory(result.profile, result.events);
}
/** Historical prefixes may be older than the current checkpoint, but never change its root or chain. */
export async function pinSocialHistory(
  profile: string,
  events: DirectoryEvent[],
): Promise<void> {
  const current = await verifyHistory(events, profile),
    old = await readCheckpoint(profile);
  if (!current) {
    if (old.events.length) throw new Error('DM directory disappeared.');
    return;
  }
  const trustedRoot = await digest(canonical(current.root)),
    through = Math.min(events.length, old.events.length);
  if (
    old.trustedRoot &&
    (old.trustedRoot !== trustedRoot ||
      canonical(events.slice(0, through)) !==
        canonical(old.events.slice(0, through)))
  )
    throw new Error('Historical DM identity differs from the trusted copy.');
  if (events.length > old.events.length)
    await saveCheckpoint(profile, { events, trustedRoot });
}
async function localSocialIdentity(profile: string, alias: string) {
  const identity = await localIdentity(profile, alias, socialDeviceName);
  if (socialDeviceNames.includes(identity.public.name)) return identity;
  // Failed localized registrations may have saved keys. Correct only local
  // metadata before signing; keep those keys and all signed history intact.
  return nameIdentity(profile, identity, socialDeviceName);
}
/** Reuses the established signed directory and key encapsulation, never private peer data. */
export async function socialAuthority(input: {
  privateAuthority: VaultAuthority;
  directory: SocialDirectoryPage;
  secret: string;
  api: SocialApi;
  alias: string;
}): Promise<VaultAuthority> {
  const { directory, secret, api } = input,
    profile = directory.profile;
  let identity = await localSocialIdentity(profile, input.alias),
    current = directory.events.at(-1) ?? null;
  const events = [...directory.events];
  let ring;
  if (!current) {
    const root = await createRecovery(profile, secret);
    ring = freshKeyring(profile);
    current = await prepareEvent({
      accountId: profile,
      previous: null,
      kind: 'initialize',
      signer: 'recovery',
      signing: root.signing,
      root: root.root,
      identities: [identity.public],
      ring,
      profile: null,
    });
    await api('register', { event: current });
    events.push(current);
  } else if (
    !current.devices.some(
      (d) =>
        d.id === identity.public.id &&
        d.signing === identity.public.signing &&
        d.wrapping === identity.public.wrapping,
    )
  ) {
    if (current.devices.some((d) => d.id === identity.public.id))
      identity = await localSocialIdentity(profile, crypto.randomUUID());
    const recovered = await recoverSecrets(current, secret);
    ring = freshKeyring(profile, recovered.ring);
    const retained = current.devices.filter(
      (d) => directory.active?.includes(d.id) && d.id !== directory.device,
    );
    current = await prepareEvent({
      accountId: profile,
      previous: current,
      kind: 'recover',
      signer: 'recovery',
      signing: recovered.signing,
      root: current.root,
      identities: [...retained, identity.public],
      ring,
      profile: null,
    });
    await api('register', { event: current });
    events.push(current);
  } else ring = await deviceSecrets(identity, current);
  for (const removed of current.devices.filter(
    (d) => d.id !== identity.public.id && !directory.active?.includes(d.id),
  )) {
    ring = freshKeyring(profile, ring);
    current = await prepareEvent({
      accountId: profile,
      previous: current,
      kind: 'revoke',
      signer: identity.public.id,
      signing: identity.signing,
      root: current.root,
      identities: remainingIdentities(current, removed.id),
      ring,
      profile: null,
    });
    await api('register', { event: current });
    events.push(current);
  }
  await pinSocialDirectory({ ...directory, events });
  const ready = current;
  return {
    session: {
      accountId: profile,
      deviceId: identity.public.id,
      csrf: input.privateAuthority.session.csrf,
    },
    offline: false,
    directory: await eventHash(ready),
    epoch: ring.epoch,
    events,
    key: async (epoch) => {
      const value = ring.keys[epoch - 1];
      if (!value) throw new Error('DM key epoch unavailable.');
      return aesKey(value);
    },
    sign: (proof) => sign(identity.signing, proof),
  };
}
