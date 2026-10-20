import { t, translatedError } from '../../shared/i18n/index.ts';
import type { UpvoteNotice } from '../../shared/public-upvotes/index.ts';
import type { ReplyPreview } from '../../shared/community-posts/index.ts';
import type { MentionNotification } from '../../shared/mention-notifications/index.ts';
import type { ModerationActivity } from './moderation.ts';

/**
 * Activity (docs/UI_PAINEIS_E_TEMAS.md): one place for items the app already
 * receives. Each source keeps its own API, authorization and checks; this module
 * only reads them on demand and calls the same actions as the original screens.
 */
export interface ActivitySources {
  upvotes?: () => Promise<readonly UpvoteNotice[]>;
  markUpvotesRead?: (ids: readonly string[]) => Promise<void>;
  mentions?: () => Promise<readonly MentionNotification[]>;
  markMentionsRead?: (ids: readonly string[]) => Promise<void>;
  moderation?: () => Promise<readonly ModerationActivity[]>;
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
  replies: () => Promise<
    readonly {
      reply: string;
      community: string;
      createdAt: string;
      read?: boolean;
      kind?: 'post' | 'reply';
      /** Author and start of the reply, already filtered by public visibility. */
      preview: ReplyPreview | null;
    }[]
  >;
  markRepliesRead: (replies: readonly string[]) => Promise<void>;
  transfers: () => Promise<readonly { id: string; name: string }[]>;
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
          : t('Não foi possível carregar.'),
    };
  }
}

/** Enqueue one source at a time, leaving the shared authority queue room for
 * current conversation work. A source failure stays visible without preventing
 * later sources; session/invalidation changes stop unstarted reads. */
export async function readActivitySnapshot(
  sources: ActivitySources,
  current: () => boolean,
): Promise<Snapshot | null> {
  const snapshot: Snapshot = {
    requests: await load(sources.requests, current),
    invites: await load(sources.groupInvites, current),
    replies: await load(sources.replies, current),
    transfers: await load(sources.transfers, current),
    calls: await load(sources.missedCalls, current),
    moderation: await load(
      sources.moderation ?? (() => Promise.resolve([])),
      current,
    ),
    mentions: await load(
      sources.mentions ?? (() => Promise.resolve([])),
      current,
    ),
    upvotes: await load(
      sources.upvotes ?? (() => Promise.resolve([])),
      current,
    ),
  };
  return current() ? snapshot : null;
}
