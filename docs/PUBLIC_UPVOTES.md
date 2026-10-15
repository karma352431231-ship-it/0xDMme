# Public upvotes and public author identity

## Owner decision and behavior — 15/10/2026

The owner explicitly removed upvote privacy in public communities and requested
X-style author notifications. Public visitors can open the net score of a visible
post/reply to page its current positive voters, showing only chosen public
handles and approved/current public avatar references. This includes existing
upvotes. Downvote/neutral identities, wallet/account/device identifiers, private
contact pictures and private groups are outside the projection. Ranking still
receives aggregates only, without voter lists or cross-community voter history.

Only a new transition into +1 admits an author Activity arrival. No self-notice,
no duplicate on retry, and no historical notification backfill. Withdrawal or
inversion deletes that active arrival and wakes the author; returning to +1
creates a new ID. The UI groups loaded arrivals by target, shows up to three
public avatars, a name/other-person count, current text excerpt, timestamp and
link. The bell counts arrival IDs individually, separately from the grouped row.
Opening Activity acknowledges loaded arrivals through the existing per-device
seen contract. Opening a grouped item marks only its captured unread IDs as read;
a concurrent later arrival cannot inherit that read receipt. Read items remain
gray. The inbox uses the existing 24-item first-page Activity window; the API also
provides a cursor for older arrivals. The public voter dialog keeps one 24-person
page and releases its previous photos instead of accumulating the full list.

Admission and listing apply bilateral blocks. Inbox reads remain signed and
recipient-only. Deleted/removed posts, replies, roots, immediate parents and
restricted media are excluded through current public visibility. No historical
text or avatar bytes are copied into notification rows. This addition uses
transactional generic in-app wakeups and the existing foreground fallback; it
does not add external Web Push delivery or change notification consent.

Feed, discussion, shared-context and profile cards use public author photos;
community identity remains a secondary link. Activity replies/publications and
mentions show public author photos. The optional signed `authors: true` inbox
projection carries validated public identity; requests without it retain their
legacy wire shape so older open clients can still read notifications. The mobile
follow chooser labels its two identities Community/User, with Simplified Chinese
translations, without changing who is followed.

## Persistence and module ownership

Migration 068 adds an initially empty active-arrival table, a recipient/time/ID
index and a partial current-positive voter index. Its composite foreign key
cascades with the existing voter/post relation; recipient deletion also cascades.
A unique actor/post key prevents duplicates and each row charges 384 bytes to the
existing global content ledger. Vote, admission, quota check and wakeup share one
transaction, including rollback. All 67 earlier migrations remain unchanged.
The existing vote score/revision and ranking rules are preserved. No dependency,
external service, private-data retention or detector change is introduced.

`community-upvotes.ts` owns vote-arrival reconciliation and bounded list/read
operations. The post store connects it through delegation and its existing
current-public-context projection. `public-upvotes` owns strict wire validation;
Activity grouping, public identity media and the voter dialog have separate client
modules. App-wide CSS receives only owning-file imports. New authored modules
are explicitly included in the corresponding-source package.

The existing `communities/index.ts`, `posts.ts`, `presentation.ts`,
`activity/index.ts` and `community-posts.ts` remain hotspots. This change keeps
new responsibilities outside their closures; no unrelated extraction is mixed
in. A separate reviewed task should first extract Activity source loading/count
and publication-row presentation, then post-store projection/read coordination,
and finally community-screen routing/lifecycle. Preserve session invalidation,
private/public boundaries, current visibility, reply drafts and expanded trees;
use the existing Activity, posts, integration and synthetic browser tests at each
step. Do not run that extraction alongside another editor of these files.

## Validation and activation boundary

Local checks cover lint, strict types, dependency boundaries, licenses, formatting,
localization and the 48-asset web build with corresponding sources. The affected
unit tests cover wire allowlists, foreign avatars, grouping, independent bell
arrivals, locale placeholders, edit rendering and preview visibility. The 27
PostgreSQL/HTTP integrations cover votes/retries/conflicts, one automatic author
wakeup, withdrawals, re-upvote IDs, stale/foreign read receipts, self/bilateral
blocks, current visibility, 24+1 voter pagination, rollback, recovery, revocation,
legacy inbox shape and public author identity. Six synthetic browser combinations
cover English/Chinese at 320/390/1280 px, visible photos, grouped upvotes, individual
bell arrivals, the public voter dialog, follow labels and no horizontal overflow.
Evidence remains in `.local/`; physical Android/iOS acceptance is not established.

**Ponto importante:** the application commit applied migration 068 only to the
exclusive local test database. The owner subsequently approved VPS publication
including this exact 067→068 transition. The integrated release binds the existing
executor to the reviewed full sources, preserves all prior rows/objects/checksums,
uses backup/restore rehearsal and requires exact-commit full main CI. Approval and
source synchronization do not establish activation; require the published receipt,
served hashes and readiness. See the [activation contract](GIT_E_DEPLOY.md#public-upvotes-and-author-identity--activation-authorized-on-15102026).

## GIF previews in Activity — 15/10/2026

Upvote and mention excerpts now use the same consent-aware GIF presentation as
publication/reply notices. Approved KLIPY media links render as compact animations
below the current text excerpt; displayed media links are hidden by the existing
renderer. Unknown links remain text. Denied/revoked external-media consent keeps
the established link/permission fallback. The reader's account choice, three-GIF
budget and refresh/navigation/session cancellation remain unchanged.

Only the caption is clamped to three lines. Its media container stays visible,
with the existing 220 px maximum GIF size. No notification data, migration,
dependency or provider contract changes. The Activity coordinator remains a
hotspot; this repair connects existing preview ownership rather than adding a
new rendering lifecycle to its closure. The separate extraction proposal above
still applies. Validate consent, fallback, URL omission, visible media bounds,
read/navigation and cleanup in both app languages and mobile/desktop layouts.

Local validation passed 25 targeted notification/GIF/consent tests and six
synthetic browser combinations (English/Chinese, 320/390/1280 px). The browser
verified GIFs in all three notice types, hidden loaded URLs, 220 px bounds,
unclipped media below clamped captions, denied/revoked consent without provider
requests, cancellation on leave and no horizontal overflow. Lint, types,
boundaries, formatting, localization and the 48-asset build passed. This repair
changes only client code/styles, one regression test and documentation; published
database sources, all 68 migrations, dependencies and deployment guards remain
unchanged. Branch CI/source delivery does not establish VPS activation.

**Superseded on 16/10/2026:** the ranking now counts distinct public voters as active members (never voter lists). See [ranking](RANKING_COMUNIDADES_TRENDING.md#active-members-and-growth-display--owner-decision-on-16102026).
