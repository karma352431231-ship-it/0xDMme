import { t, translatedError } from '../../shared/i18n/index.ts';
import type { UpvoteNotice } from '../../shared/public-upvotes/index.ts';
import type {
  ReplyPreview,
  ReplyTarget,
} from '../../shared/community-posts/index.ts';
import type { MentionNotification } from '../../shared/mention-notifications/index.ts';
import type { FollowNotice } from '../../shared/follow-notices/index.ts';
import type { PublicActivitySource } from '../../shared/activity-snapshot/index.ts';
import type { ModerationActivity } from './moderation.ts';
import type { PublicActivityRead } from './public-snapshot.ts';

type Read<T> = (response?: () => unknown) => Promise<readonly T[]>;
interface ActivityReply {
  reply: string;
  community: string;
  createdAt: string;
  read?: boolean;
  kind?: 'post' | 'reply';
  /** Author and start of the reply, already filtered by public visibility. */
  preview: ReplyPreview | null;
  /** The reader's own content this reply answered. */
  target?: ReplyTarget;
}

/**
 * Activity: one place for items the app already
 * receives. Each source keeps its own API, authorization and checks; this module
 * only reads them on demand and calls the same actions as the original screens.
 */
export interface ActivitySources {
  publicSnapshot?: (
    current: () => boolean,
  ) => Promise<PublicActivityRead | null>;
  upvotes?: Read<UpvoteNotice>;
  markUpvotesRead?: (ids: readonly string[]) => Promise<void>;
  mentions?: Read<MentionNotification>;
  follows?: Read<FollowNotice>;
  markFollowsRead?: (ids: readonly string[]) => Promise<void>;
  markMentionsRead?: (ids: readonly string[]) => Promise<void>;
  moderation?: Read<ModerationActivity>;
  markModerationRead?: (ids: readonly string[]) => Promise<void>;
  requests: () => Promise<
    readonly {
      accountId: string;
      name: string;
      address: string;
      ecosystem: string;
    }[]
  >;
  respondRequest: (accountId: string, accept: boolean) => Promise<void>;
  groupInvites: () => Promise<
    readonly { id: string; kind: 'invite' | 'transfer'; actor: string }[]
  >;
  respondGroupInvite: (id: string, accept: boolean) => Promise<void>;
  replies: Read<ActivityReply>;
  markRepliesRead: (replies: readonly string[]) => Promise<void>;
  transfers: Read<{ id: string; name: string }>;
  missedCalls: () => Promise<
    readonly { id: string; peer: string; label: string; at: number }[]
  >;
  clearMissedCalls: () => Promise<void>;
}

export type Loaded<T> = { items: readonly T[]; problem: string };

type Item<
  K extends
    'requests' | 'groupInvites' | 'replies' | 'transfers' | 'missedCalls',
> = Awaited<ReturnType<ActivitySources[K]>>[number];

export interface Snapshot {
  upvotes: Loaded<UpvoteNotice>;
  mentions: Loaded<MentionNotification>;
  follows: Loaded<FollowNotice>;
  moderation: Loaded<ModerationActivity>;
  requests: Loaded<Item<'requests'>>;
  invites: Loaded<Item<'groupInvites'>>;
  replies: Loaded<Item<'replies'>>;
  transfers: Loaded<Item<'transfers'>>;
  calls: Loaded<Item<'missedCalls'>>;
}

export function empty(): Snapshot {
  return {
    upvotes: { items: [], problem: '' },
    mentions: { items: [], problem: '' },
    follows: { items: [], problem: '' },
    moderation: { items: [], problem: '' },
    requests: { items: [], problem: '' },
    invites: { items: [], problem: '' },
    replies: { items: [], problem: '' },
    transfers: { items: [], problem: '' },
    calls: { items: [], problem: '' },
  };
}

async function load<T>(
  read: () => Promise<readonly T[]>,
  current: () => boolean,
): Promise<Loaded<T>> {
  if (!current()) return { items: [], problem: '' };
  try {
    return { items: await read(), problem: '' };
  } catch (error: unknown) {
    return {
      items: [],
      problem:
        error instanceof Error
          ? translatedError(error.message)
          : t('Could not load.'),
    };
  }
}

async function publicReader(
  source: ActivitySources['publicSnapshot'],
  current: () => boolean,
): Promise<PublicActivityRead | null> {
  if (!source || !current()) return null;
  try {
    return await source(current);
  } catch (error: unknown) {
    return () => {
      throw error;
    };
  }
}

/** Enqueue one authority read at a time, leaving room for conversation work.
 * Each source projects its own result. Invalidation stops unstarted reads. */
export async function readActivitySnapshot(
  sources: ActivitySources,
  current: () => boolean,
): Promise<Snapshot | null> {
  const requests = await load(sources.requests, current);
  const invites = await load(sources.groupInvites, current);
  const read = await publicReader(sources.publicSnapshot, current);
  function publicSource<T>(name: PublicActivitySource, source?: Read<T>) {
    return load(
      () =>
        source?.(read ? () => read(name) : undefined) ?? Promise.resolve([]),
      current,
    );
  }
  const snapshot: Snapshot = {
    requests,
    invites,
    replies: await publicSource('replies', sources.replies),
    transfers: await publicSource('transfers', sources.transfers),
    calls: await load(sources.missedCalls, current),
    moderation: await publicSource('moderation', sources.moderation),
    mentions: await publicSource('mentions', sources.mentions),
    upvotes: await publicSource('upvotes', sources.upvotes),
    follows: await publicSource('follows', sources.follows),
  };
  return current() ? snapshot : null;
}
