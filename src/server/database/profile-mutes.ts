import type pg from 'pg';
import { AccountError, keys, uuid } from '../../shared/account/index.ts';
import {
  communityBoolean,
  communityPageSize,
} from '../../shared/communities/index.ts';
import { postCount } from '../../shared/community-posts/index.ts';
import type {
  ProfileMuteState,
  SafetyProfilePage,
} from '../../shared/profile-mutes/index.ts';
import type { PublicProfileStore } from './public-profile.ts';

type Client = Pick<pg.PoolClient, 'query'>;
interface MuteContext {
  client: Client;
  actor: { id: string };
}
/** Rows kept per profile, muted or not; bounds storage without a quota ledger. */
const muteRowLimit = 5000;

/** Mute state, mute changes and the two lists of the Mute and block page. */
export async function profileMuteOperation(
  context: MuteContext,
  input: {
    operation: string;
    data: Record<string, unknown>;
    profiles: Pick<PublicProfileStore, 'identities'>;
  },
): Promise<ProfileMuteState | SafetyProfilePage> {
  const { operation, data } = input;
  if (operation === 'mute-list' || operation === 'block-list') {
    keys(data, ['after']);
    const after = data['after'] === null ? null : uuid(data['after']);
    return listPage(context, {
      blocked: operation === 'block-list',
      after,
      profiles: input.profiles,
    });
  }
  const changing = operation === 'mute';
  keys(data, changing ? ['target', 'muted', 'revision'] : ['target']);
  const target = uuid(data['target']);
  if (target === context.actor.id)
    throw new AccountError(409, 'You cannot mute your own profile.');
  const old = await currentMute(context, target);
  if (!changing) return old;
  return changeMute(context, {
    target,
    old,
    muted: communityBoolean(data['muted']),
    revision: postCount(data['revision']),
  });
}

async function currentMute(
  context: MuteContext,
  target: string,
): Promise<ProfileMuteState> {
  const found = await context.client.query<ProfileMuteState>(
    'SELECT muted,revision FROM hash_talk.public_profile_mutes WHERE actor=$1 AND target=$2',
    [context.actor.id, target],
  );
  return found.rows[0] ?? { muted: false, revision: 0 };
}

async function changeMute(
  context: MuteContext,
  change: {
    target: string;
    old: ProfileMuteState;
    muted: boolean;
    revision: number;
  },
): Promise<ProfileMuteState> {
  const { old } = change;
  // A retry of the change that already landed returns its result.
  if (old.revision === change.revision + 1 && old.muted === change.muted)
    return old;
  if (old.revision !== change.revision)
    throw new AccountError(
      409,
      'Your mute choice changed. Reload before retrying.',
    );
  if (old.muted === change.muted) return old;
  if (old.revision === 0) await assertRoom(context);
  const result = await context.client.query<ProfileMuteState>(
    `INSERT INTO hash_talk.public_profile_mutes(actor,target,muted,revision)
     SELECT $1,$2,$3,1 WHERE EXISTS(SELECT 1 FROM hash_talk.public_profiles WHERE id=$2)
     ON CONFLICT(actor,target) DO UPDATE SET muted=$3,revision=hash_talk.public_profile_mutes.revision+1
     RETURNING muted,revision`,
    [context.actor.id, change.target, change.muted],
  );
  const saved = result.rows[0];
  if (!saved) throw new AccountError(404, 'Public profile unavailable.');
  return saved;
}

async function assertRoom(context: MuteContext): Promise<void> {
  const used = await context.client.query<{ full: boolean }>(
    'SELECT count(*)>=$2 AS full FROM (SELECT 1 FROM hash_talk.public_profile_mutes WHERE actor=$1 LIMIT $2) kept',
    [context.actor.id, muteRowLimit],
  );
  if (used.rows[0]?.full)
    throw new AccountError(409, 'Mute limit reached. Unmute someone first.');
}

/** Bounded, id-ordered page of the profiles this profile muted or blocked. */
async function listPage(
  context: MuteContext,
  input: {
    blocked: boolean;
    after: string | null;
    profiles: Pick<PublicProfileStore, 'identities'>;
  },
): Promise<SafetyProfilePage> {
  const found = await context.client.query<{ target: string }>(
    input.blocked
      ? 'SELECT target FROM hash_talk.social_blocks WHERE actor=$1 AND blocked AND ($2::uuid IS NULL OR target>$2) ORDER BY target LIMIT $3'
      : 'SELECT target FROM hash_talk.public_profile_mutes WHERE actor=$1 AND muted AND ($2::uuid IS NULL OR target>$2) ORDER BY target LIMIT $3',
    [context.actor.id, input.after, communityPageSize + 1],
  );
  const ids = found.rows.slice(0, communityPageSize).map((row) => row.target);
  const identities = await input.profiles.identities(context.client, ids);
  return {
    items: ids.flatMap((id) => {
      const profile = identities.get(id);
      return profile ? [profile] : [];
    }),
    next: found.rows.length > communityPageSize ? (ids.at(-1) ?? null) : null,
  };
}
