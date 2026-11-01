import { Wallet } from 'ethers';
import type pg from 'pg';
import { eventHash, sign } from '../../src/shared/devices/index.ts';
import { communityBody } from '../../src/shared/communities/index.ts';
import { publicProfileBody } from '../../src/shared/public-profile/index.ts';
import {
  createIdentity,
  createRecovery,
  newSecret,
} from '../../src/client/device-keys/index.ts';
import {
  freshKeyring,
  prepareEvent,
} from '../../src/client/device-operations/index.ts';
import type { AccountService } from '../../src/server/account/index.ts';
import type { DeviceService } from '../../src/server/devices/index.ts';
import type { CommunityService } from '../../src/server/communities/index.ts';
import type { PublicProfileService } from '../../src/server/public-profile/index.ts';

/**
 * New downvotes are refused (01/11/2026), but rows cast before stay and still
 * count. Writes one such row the way the vote operation did, so the score,
 * ranking and metric triggers see a legacy downvote.
 */
export async function seedLegacyDownvote(
  client: Pick<pg.ClientBase, 'query'>,
  vote: { profile: string; post: string },
): Promise<void> {
  await client.query(
    `INSERT INTO hash_talk.community_votes(profile_id,post_id,position,revision,voted_at) VALUES($1,$2,-1,1,clock_timestamp()) ON CONFLICT(profile_id,post_id) DO UPDATE SET position=-1,revision=hash_talk.community_votes.revision+1,voted_at=clock_timestamp()`,
    [vote.profile, vote.post],
  );
}

export async function createCommunityAccount(options: {
  account: AccountService;
  devices: DeviceService;
  communities: CommunityService;
  profiles: PublicProfileService;
  accounts: string[];
  addresses: string[];
}) {
  const wallet = Wallet.createRandom();
  options.addresses.push(wallet.address.toLowerCase());
  const challenge = await options.account.challenge({
    address: wallet.address,
    chainId: 1,
    deviceId: crypto.randomUUID(),
  });
  const login = await options.account.login(
    {
      id: challenge.id,
      signature: await wallet.signMessage(challenge.message),
    },
    challenge.browserToken,
  );
  options.accounts.push(login.session.accountId);
  const identity = await createIdentity(
      login.session.deviceId,
      'Comunidade sintética',
    ),
    recovery = await createRecovery(login.session.accountId, newSecret()),
    ring = freshKeyring(login.session.accountId);
  const event = await prepareEvent({
    accountId: login.session.accountId,
    previous: null,
    kind: 'initialize',
    signer: 'recovery',
    signing: recovery.signing,
    root: recovery.root,
    identities: [identity.public],
    ring,
    profile: null,
  });
  await options.devices.commit(login.session, { event, profile: null });
  const directory = await eventHash(event);
  async function proof(operation: string, payload: Record<string, unknown>) {
    const body = { directory, payload };
    return {
      ...body,
      signature: await sign(
        identity.signing,
        communityBody(
          login.session.accountId,
          login.session.deviceId,
          operation,
          body,
        ),
      ),
    };
  }
  async function operate(operation: string, payload: Record<string, unknown>) {
    return options.communities.operate(
      operation,
      login.session,
      await proof(operation, payload),
    );
  }
  async function publicIdentity(handle: string) {
    const body = { directory, payload: { handle, consent: true } };
    const result = await options.profiles.operate('create', login.session, {
      ...body,
      signature: await sign(
        identity.signing,
        publicProfileBody(
          login.session.accountId,
          login.session.deviceId,
          'create',
          body,
        ),
      ),
    });
    if (!result) throw new Error('Perfil sintético não criado.');
    return result.profile;
  }
  return {
    wallet,
    login,
    identity,
    recovery,
    ring,
    event,
    directory,
    proof,
    operate,
    publicIdentity,
  };
}

/** A post needs a title and a tag; fixtures use the community's first active tag. */
export async function rootPostContent(
  communities: CommunityService,
  community: string,
  text: string,
  title = 'Post sintético',
) {
  const tag = (await communities.tags(community, null)).items[0]?.id;
  return { title, text, tags: tag ? [tag] : [] };
}
