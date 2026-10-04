import {
  createIdentity,
  createRecovery,
  newSecret,
  aesKey,
} from '../../src/client/device-keys/index.ts';
import {
  freshKeyring,
  prepareEvent,
} from '../../src/client/device-operations/index.ts';
import { eventHash, sign } from '../../src/shared/devices/index.ts';
import type { VaultAuthority } from '../../src/client/vault-authority/index.ts';

export async function groupParticipant(
  input: { accountId?: string; deviceId?: string } = {},
) {
  const accountId = input.accountId ?? crypto.randomUUID(),
    identity = await createIdentity(
      input.deviceId ?? crypto.randomUUID(),
      'Sintético',
    );
  const root = await createRecovery(accountId, newSecret()),
    ring = freshKeyring(accountId);
  const directory = await prepareEvent({
    accountId,
    previous: null,
    kind: 'initialize',
    signer: 'recovery',
    signing: root.signing,
    root: root.root,
    identities: [identity.public],
    ring,
    profile: null,
  });
  const head = await eventHash(directory);
  const authority: VaultAuthority = {
    session: { accountId, deviceId: identity.public.id, csrf: 'sintético' },
    offline: false,
    directory: head,
    epoch: 1,
    events: [directory],
    key: () => aesKey(ring.keys[0] ?? ''),
    sign: (proof) => sign(identity.signing, proof),
  };
  return {
    accountId,
    deviceId: identity.public.id,
    directory,
    head,
    signing: identity.signing,
    authority,
  };
}
