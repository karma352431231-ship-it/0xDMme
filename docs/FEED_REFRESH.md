# Feed refresh indicator

On November 9, 2026, the owner requested that the floating refresh button appear only when new posts are available. Returning to the top after reading older posts must not display a generic refresh button by itself.

`FeedRefresh` owns the indicator, scroll triggers, single-flight checks, timer and author-photo cleanup. Returning to the top or pressing the active feed tab requests a check; only a positive result displays the indicator. Pending, empty or failed checks keep it hidden. An empty subsequent check removes a previously displayed indicator. Activating it invalidates pending checks and reloads only the feed.

`DiscoveryFeedPage.peek` retains ownership of comparing the first page with the newest post already loaded, using the current feed filters. The existing 45-second background interval and maximum of three author photos remain in place. Ranking views have no new-post check and use the active tab's normal reload path.

Regression coverage in `tests/feed-refresh.test.ts` exercises unchanged content, pending/failed checks, confirmed posts, refresh, withdrawal, concurrent checks and disposal in English and Simplified Chinese. This change requires no server, schema or dependency changes.
