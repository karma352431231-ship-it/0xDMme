export const activitySnapshotPath = '/api/account/activity-snapshot';

/** The batch is limited to the first page of the bell's existing signed reads. */
export const publicActivitySources = {
  replies: {
    service: 'communities',
    operation: 'post-notifications',
    payload: { after: null, authors: true, targets: true, thumbnails: true },
  },
  transfers: {
    service: 'communities',
    operation: 'list',
    payload: { kind: 'invitations', after: null },
  },
  moderation: {
    service: 'public-profile',
    operation: 'moderation-notices',
    payload: { after: null },
  },
  mentions: {
    service: 'public-profile',
    operation: 'mention-notifications',
    payload: { after: null },
  },
  upvotes: {
    service: 'communities',
    operation: 'post-upvote-notifications',
    payload: { after: null, thumbnails: true },
  },
  follows: {
    service: 'public-profile',
    operation: 'follow-notifications',
    payload: { after: null },
  },
} as const;

export type PublicActivitySource = keyof typeof publicActivitySources;
export const publicActivityKeys = Object.keys(
  publicActivitySources,
) as PublicActivitySource[];
