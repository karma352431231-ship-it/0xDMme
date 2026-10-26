export const engagementDefinitionVersion = 1;

export type MetricAggregation = 'additive' | 'distinct' | 'current';
export type MetricScope = 'project' | 'community' | 'post';
export type MetricUnit =
  | 'accounts'
  | 'profiles'
  | 'page_views'
  | 'browsers'
  | 'posts'
  | 'replies'
  | 'views'
  | 'votes'
  | 'actions'
  | 'links'
  | 'contributors'
  | 'communities';

export interface MetricDefinition {
  readonly aggregation: MetricAggregation;
  readonly unit: MetricUnit;
  readonly scopes: readonly MetricScope[];
  readonly description: string;
}

const project = ['project'] as const;
const community = ['project', 'community'] as const;
const post = ['project', 'community', 'post'] as const;

function definition(
  aggregation: MetricAggregation,
  unit: MetricUnit,
  scopes: readonly MetricScope[],
  description: string,
): MetricDefinition {
  return Object.freeze({ aggregation, unit, scopes, description });
}

/** Definitions are independent of collection activation and retention policy. */
export const engagementMetrics = Object.freeze({
  accounts_created: definition(
    'additive',
    'accounts',
    project,
    'Committed account registrations; excludes login, recovery and enrollment.',
  ),
  public_profiles_created: definition(
    'additive',
    'profiles',
    project,
    'Committed public profile creations; excludes edits and renames.',
  ),
  accounts_existing: definition(
    'current',
    'accounts',
    project,
    'Accounts present at the report cutoff, independently of creation totals.',
  ),
  public_profiles_existing: definition(
    'current',
    'profiles',
    project,
    'Public profiles present at the report cutoff.',
  ),
  public_page_views: definition(
    'additive',
    'page_views',
    community,
    'Qualified public-page navigations; repeated visits may count again.',
  ),
  public_site_visitors_estimated: definition(
    'distinct',
    'browsers',
    project,
    'Estimated distinct public-site browsers in a supported interval, not people.',
  ),
  posts_created: definition(
    'additive',
    'posts',
    community,
    'Accepted top-level content records; excludes replies and rejected requests.',
  ),
  posts_published: definition(
    'additive',
    'posts',
    community,
    'First public visibility of top-level posts; excludes edits and restoration.',
  ),
  replies_created: definition(
    'additive',
    'replies',
    post,
    'Accepted reply records, filterable by their parent or root post.',
  ),
  replies_published: definition(
    'additive',
    'replies',
    post,
    'First public visibility of replies; excludes restoration.',
  ),
  post_views_estimated: definition(
    'additive',
    'views',
    post,
    'New independent browser/post view marks; excludes reply views.',
  ),
  reply_views_estimated: definition(
    'additive',
    'views',
    post,
    'New independent browser/reply view marks; distinct from top-level views.',
  ),
  upvotes_added: definition(
    'additive',
    'votes',
    post,
    'Accepted transitions into the positive vote position.',
  ),
  upvotes_removed: definition(
    'additive',
    'votes',
    post,
    'Transitions out of a positive vote; user action and cleanup stay distinct.',
  ),
  downvotes_added: definition(
    'additive',
    'votes',
    post,
    'Accepted transitions into the negative vote position.',
  ),
  downvotes_removed: definition(
    'additive',
    'votes',
    post,
    'Transitions out of a negative vote; user action and cleanup stay distinct.',
  ),
  upvotes_current: definition(
    'current',
    'votes',
    post,
    'Positive vote positions at the report cutoff, not historical additions.',
  ),
  downvotes_current: definition(
    'current',
    'votes',
    post,
    'Negative vote positions at the report cutoff, not historical additions.',
  ),
  share_actions_started: definition(
    'additive',
    'actions',
    post,
    'Observed deliberate app share actions; does not establish external delivery.',
  ),
  links_copied: definition(
    'additive',
    'links',
    post,
    'Successful app copy-link writes; may overlap with sharing actions.',
  ),
  public_contributors_distinct: definition(
    'distinct',
    'contributors',
    community,
    'Distinct public authors of eligible published posts or replies.',
  ),
  communities_active: definition(
    'distinct',
    'communities',
    project,
    'Communities with eligible published posts or replies in the interval.',
  ),
});

export type EngagementMetric = keyof typeof engagementMetrics;

export function isEngagementMetric(value: unknown): value is EngagementMetric {
  return typeof value === 'string' && Object.hasOwn(engagementMetrics, value);
}
