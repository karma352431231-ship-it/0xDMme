# Public post keyword search

Owner request, 20 October 2026: the feed search field must find post titles,
post bodies and replies, emphasize matching text, and retain the existing feed
scope, ordering and age filters. Main integration and VPS activation were
explicitly requested after implementation.

Submitting a query or choosing its post-search result opens the community feed.
User/community suggestions remain available in the same field. Results keep the
current Highlights, Recent, Most voted or Most discussed ordering and period;
Following keeps the authenticated following predicates. Highlights combines the
existing public engagement, age and follow signals. Search does not introduce a
new reader profile or external service.

Queries are limited to 100 characters and normalize Unicode compatibility,
spacing and case. PostgreSQL's built-in `simple` text search requires all query
words across the title/body. Punctuation is not a search operator. Replies are
eligible without the discovery feed's usual engagement/follow threshold, and
matching replies are not collapsed into one representative. Current visibility,
root moderation, blocks, personal hiding and following scope still apply before
pagination. Search cursors bind the complete normalized filters and viewer
through a SHA-256 identity; changing the query invalidates its cursor.

Matching text nodes are wrapped in `mark` elements with the existing white theme
token and weight 650, with no highlight background. The renderer retains links
and mentions and never interprets search text as HTML. Search results show their
complete bounded text so a match beyond the normal preview is visible. Search
bookmarks cannot restore another query's retained page.

Migration 095 creates only a GIN expression index on the existing public title
and body, with the same normalization as the query. It adds no extension,
column, text copy, trigger, private-message access or retention rule. Existing
indexes, rows and accounting remain intact. Preparing the migration locally
does not activate it on the VPS; its reviewed activation must use the existing
deployment executor, with backup, preserved data and exact passing CI.

The discovery and community screen closures remain hotspots. Their changes are
limited to passing the new filter and rendering options; query validation,
highlighting and the search submission link live in separate owning modules.
A separate review should split discovery navigation/bookmarks from page loading
and projection, in that order, retaining pagination, draft/media lifetimes and
generation checks. Feed-return, discovery UI and store integration tests guard
those boundaries.
