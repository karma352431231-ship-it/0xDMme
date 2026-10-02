import { encode } from '../../shared/account/index.ts';
import type { EncryptedProfile } from '../../shared/account/index.ts';
import {
  canonical,
  digest,
  eventHash,
  identityOf,
  verifyTransition,
} from '../../shared/devices/index.ts';
import type {
  AuthorizedDevice,
  DeviceIdentity,
  DirectoryEvent,
  RecoveryRoot,
} from '../../shared/devices/index.ts';
import {
  keyContext,
  newSecret,
  sealTo,
  signEvent,
} from '../device-keys/index.ts';
import type { Keyring } from '../device-keys/index.ts';

export function freshKeyring(accountId: string, previous?: Keyring): Keyring {
  return {
    accountId,
    epoch: (previous?.epoch ?? 0) + 1,
    keys: [...(previous?.keys ?? []), newSecret()],
  };
}
export function blankSignature(): string {
  return encode(new Uint8Array(64));
}
interface EventInput {
  accountId: string;
  previous: DirectoryEvent | null;
  kind: DirectoryEvent['kind'];
  signer: string;
  signing: CryptoKey;
  root: RecoveryRoot;
  identities: DeviceIdentity[];
  ring: Keyring;
  linkId?: string;
  profile: EncryptedProfile | null;
}
async function sealDevices(input: EventInput): Promise<AuthorizedDevice[]> {
  const previous = input.previous;
  const context = { accountId: input.accountId, epoch: input.ring.epoch };
  const devices: AuthorizedDevice[] = [];
  for (const identity of input.identities.sort((a, b) =>
    a.id.localeCompare(b.id),
  )) {
    const existing = previous?.devices.find(
      (device) => device.id === identity.id,
    );
    const envelope =
      input.kind === 'link' && existing
        ? existing.envelope
        : await sealTo(
            identity.wrapping,
            input.ring,
            keyContext(context, identity.id),
          );
    devices.push({ ...identity, envelope });
  }
  return devices;
}
function revokedDevices(
  previous: DirectoryEvent | null,
  devices: AuthorizedDevice[],
): string[] {
  const removed =
    previous?.devices
      .filter(
        (device) => !devices.some((remaining) => remaining.id === device.id),
      )
      .map((device) => device.id) ?? [];
  return [...(previous?.revoked ?? []), ...removed].sort();
}
async function recoveryEnvelope(input: EventInput) {
  if (input.kind === 'link' && input.previous) return input.previous.recovery;
  return sealTo(
    input.root.wrapping,
    input.ring,
    keyContext(
      { accountId: input.accountId, epoch: input.ring.epoch },
      'recovery',
    ),
  );
}
export async function prepareEvent(input: EventInput): Promise<DirectoryEvent> {
  const previous = input.previous;
  const devices = await sealDevices(input);
  const event: DirectoryEvent = {
    version: 1,
    accountId: input.accountId,
    revision: (previous?.revision ?? 0) + 1,
    epoch: input.ring.epoch,
    previous: previous ? await eventHash(previous) : null,
    kind: input.kind,
    signer: input.signer,
    root: input.root,
    devices,
    revoked: revokedDevices(previous, devices),
    recovery: await recoveryEnvelope(input),
    linkId: input.linkId ?? null,
    profile: input.profile ? await digest(canonical(input.profile)) : null,
    signature: blankSignature(),
  };
  return verifyTransition(previous, await signEvent(event, input.signing));
}
export function remainingIdentities(
  event: DirectoryEvent,
  removed: string,
): DeviceIdentity[] {
  return event.devices
    .filter((device) => device.id !== removed)
    .map(identityOf);
}

export function recoveryIdentities(
  event: DirectoryEvent,
  revoked: string[],
): DeviceIdentity[] {
  if (
    new Set(revoked).size !== revoked.length ||
    revoked.some((id) => !event.devices.some((device) => device.id === id))
  )
    throw new Error(
      'Seleção de aparelhos inválida. Confira a lista novamente.',
    );
  return event.devices
    .filter((device) => !revoked.includes(device.id))
    .map(identityOf);
}
