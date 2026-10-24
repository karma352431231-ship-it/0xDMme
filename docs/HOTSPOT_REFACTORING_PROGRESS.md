# Hotspot refactoring from the current main branch

Base: `e18f644`. Branch: `codex/hotspot-refactors`. Requested sequence: H08,
H02, H01 presentation, H07 group presentation, then H03 community presentation.
Integration of the first four stages is recorded below. The H03 stage remains
local on this branch; another merge, push and VPS publication are outside its scope.

The October 22 audit inspected an older checkout. The current main branch
already includes the app CSS split, post-thread rendering, message directory
and history owners, and other subsequent functionality. This work preserves
those changes and addresses the remaining responsibilities instead of applying
the old snapshot over them. Product flows, authorization, cryptographic formats,
storage identities, retention and public entry-point contracts must stay intact.

## H08: remaining global feature styles

The existing ordered app stylesheet remains the composition point, and theme
tokens stay in its existing `theme.css` owner. Vault usage/list presentation,
status display, chat layout and recovery text now live beside their features.
Shared card control defaults remain shared. The contact grid rule lives with
contact settings, after the general card grid. Phone search, conversation-row
and voice-dock overrides live with their components, after the corresponding
base rules. There is no new global override tail, specificity increase, literal
color, runtime state or application-logic change.

Validation: 19 affected appearance/layout/chat/settings tests; ESLint, strict
types, dependency boundaries, repository formatting and web build passed.
The pre-change characterization run also passed 44 tests, including discovery,
post-thread and message lifecycle coverage. The local browser is disabled in
Work settings, so the prepared synthetic before/after browser comparison could
not run. Visual equivalence across themes, breakpoints, focus and open/closed
states remains unverified; automated checks do not replace that evidence.

## H02: public posts and discovery ownership

`posts.ts` switches the post-list and tag-editor lifetimes. `post-list.ts`
owns the bounded displayed page and composes the existing thread. `post-card.ts`
owns card nodes, media/observer cleanup and restricted-option invalidation;
it receives an immutable route context and narrow post operations. `tag-management.ts`
owns tag pagination, busy state and the stable create ID across retries.

`discovery-feed.ts` and `discovery-ranking.ts` each own their displayed query,
cursor, snapshot and media lifetime. The discovery entry point retains controls,
routing, bookmarks, parked-page orchestration and account-ranking composition.
Existing card, thread, snapshot and refresh-presentation contracts are reused.
The operation interfaces used by post sharing and preference controls now require
only their existing request capability.

Validation: 38 focused post/thread/discovery tests passed, including three new
lifecycle characterizations. ESLint, strict types, dependency boundaries,
repository formatting and web build passed. No server or database logic changed.
The browser limitation recorded above still applies.

## H01 presentation: composition ownership

`messages/composer.ts` owns reply/edit context, focus requests, attachment
selection/previews, the recorder and its recipient, emoji/GIF controls and DOM
bindings. It calls only the existing compose operations; durable outbox IDs,
queueing, synchronization, verified history and cryptography keep their existing
owners. Availability is a read-only snapshot of session/peer/history/call facts.
History receives narrow media and reaction-picker capabilities rather than
access to writable composer state. The composer owns its peer-preview attribute.

The current main branch already has directory, history, synchronization,
continuity, warmup, presence, live-update and event-binding owners. They are
reused rather than replaced with a second session-runtime coordinator. App
session authority remains in the existing coordinator/controller. BFCache
suspension retains the local preview; final departure disposes the composer.
Microphone gestures accept an optional lifetime signal so remount/disposal can
cancel delayed callbacks and window listeners. Existing callers remain valid.
A completed compose cannot clear another session, recipient or composition's
new draft. Call-button failures are reported through the existing notice path.

Validation before final combined checks: 71 focused coordinator/lifecycle,
chat, attachment and voice tests passed, including stale-edit completion and
microphone-gesture disposal. The final combined local check and its environment-specific retries are recorded below.

## Structural review and remaining limits

The extracted modules own their state/resources and cleanup instead of receiving
the original writable closure. Public UI entry points and message exports remain
compatible. No database, server, dependency, migration, retention or deploy policy
changes are included. Existing source-archive roots cover the new frontend files.

The message entry point still composes several existing workflows. Notification
settings and pending-send row presentation remain preexisting follow-up work:
if that area changes next, move settings mount/reset/disposal to a notification
settings owner first, then pending-row rendering behind its confirmed pending
list contract. Check session reset, failed pending reads and voice/upload notices
with the coordinator, notification and attachment tests. This task does not
claim to resolve the separate H01 engine hotspot or all preexisting coupling.

Visual comparison could not run because local browser access is disabled.
PostgreSQL integration and remote CI have not been run for this branch. There
has been no merge into main, remote push or VPS operation.

## Final local validation

- The combined check passed ESLint, strict types, dependency boundaries,
  license review, repository formatting, localization coverage and all three
  web/evaluation/collection builds. The initial unit run passed 1,503 of 1,504
  tests; its sole failure was missing local ZK artifacts in the fresh checkout.
  After the existing CI preparation command verified the pinned public artifacts,
  the one failing ZK test passed. Passing tests were not repeated unnecessarily.
- Deployment unit tests passed 389 of 392 with the host's Python 3.9; three
  archive-extraction cases needed the supported `filter` API. Only those three
  cases were repeated with the already-installed Python 3.12.14, and passed.
  These were local tests with synthetic resources, not deployment operations.
- All 51 moderation evaluation unit tests passed.
- A final CSS review preserved the ordered normalized declarations for all
  2,592 selector/condition contexts. The vault import follows shared controls
  to retain that ordering. The affected 19 CSS/UI tests and web build passed
  again after this ordering adjustment. This static comparison does not prove
  computed style or visual equivalence across different matching selectors.
- The generated source archive includes all ten new frontend modules/styles;
  no archive roots or resource budgets were broadened. Final whitespace and
  changed-document formatting checks passed.

The first three implementation stages are committed on this branch. Visual
acceptance remains pending because browser access is disabled. Database
integration and remote CI are unrun; no production-readiness claim is made.

## H07: group conversation, administration and vault presentation

`groups/management-panel.ts` owns the settings identity, membership controls,
incoming invitations/ownership offers and creation controls. It composes the
existing photo, description, participant-profile and admission-dialog owners,
including their resets on selection, navigation and account-session changes.
Dialog operations keep their original runner and local feedback; chat/settings
commands keep their original notice/error wrapper. Ownership still requires
the existing confirmation and recipient consent.

`groups/vault-panel.ts` owns the displayed quota/cleanup page, cursor and panel
bindings. It preserves the open-panel read condition, local-only restriction,
quota values, cleanup warning and owner-only clear control/confirmation. The
existing controller continues to authorize and execute all remote operations.

`groups/chat-view.ts` owns history rows and external-media cancellation,
attachments, voice recording/previews, emoji, message actions and pending-send
presentation. The original send steps, recording/navigation guards, media
retention on unchanged receipt updates, and different navigation/suspension/
revocation cleanup remain in place. Browser listeners retain the existing group
UI lifetime; no additional cancellation or retry policy was introduced.

The public `startGroups` contract stays intact. Its coordinator retains the one
account session, controller, verified-history scheduling and directory/counter
composition. New presentation owners receive selected domain operations and
read-only identity getters, never the original mutable closure or trust state.
The admission dialog's controller dependency is narrowed to its three existing
operations. Existing dependency-cruiser rules cover the new internal modules;
no rule exceptions, dependencies, engine/server changes, styles, migrations or
source-archive roots were added.

Structural review: presentation state/resources moved into their respective
owners, rather than into forwarding helpers; controller authority and existing
render/cleanup boundaries remain in the coordinator. Existing engine concerns
in `groups/controller.ts` are outside this presentation task. If that engine is
addressed later, characterize session invalidation and verification first,
then separate verified reading from sending while retaining one authority;
use the existing group crypto/preparation/retry tests and database integration.

Validation: 109 relevant tests passed across targeted runs, including nine
assembled group-screen characterizations. Those same nine cases also passed
against the pre-refactor entry point. Coverage includes role changes and
local-only controls, ownership consent, vault reads/paging/confirmation, voice
navigation and interruption, draft preservation on compose failure, pending
draft actions, receipt-only media reuse and late photo/session cleanup.
Existing crypto/governance, quotas/retention, preparation, message coordinator,
attachment, voice and portable-source tests also passed. These use synthetic
data and IO/media/layout adapters, not real browser media or backend services.
ESLint, strict types, dependency boundaries, repository formatting, localization
coverage and the web build passed. The generated portable-source archive has
1,142 entries and contains byte-identical copies of all three new group modules;
source/release budgets were not changed. Final diff/whitespace review passed.

The local browser remains disabled in Work settings, confirmed again during
this stage. The assembled browser smoke for recording/navigation/invitation/
vault interactions remains pending. PostgreSQL integration and remote CI were
not run. This stage does not include merging, pushing or VPS operations.

## Integration with the current main branch

The owner subsequently requested integration and activation. The fetched main
at `f1e41e4` contains newer group send/recovery, author identity and co-member
contact features, public share counts and focused-composer behavior. The merge
preserves that current behavior, including its removal of the legacy pending
draft card, rather than restoring the earlier audit's behavior.

The existing text queue, outgoing rows and delivery trace now live with the
group chat view; verified readback scheduling remains in the coordinator.
`member-presentation.ts` owns the shared member labels/wallet lookup and the
separate settings/author photo-cache lifetimes. Management and history use its
narrow operations. The private composer retains current main's focus after
text admission. No engine, database, migration, runtime or infrastructure change
is added relative to the fetched main. Integration validation and deployment
evidence are recorded privately in `.local/`.

The integration's focused run passed 111 tests; the additional co-member contact
case passed separately. All eleven assembled group UI cases also passed against
the fetched main and the integrated presentation owners. This includes queued
text acceptance without an extra readback, retry with the same ID and
invitation-only contact privacy.

## H03: community directory, notifications and editor lifetimes

Base: the integrated main commit `69f80ca`. `community-directory.ts` owns main-list
pagination and followed-sidebar rendering, composing the existing sidebar
snapshot owner so unchanged reads retain their nodes and photos.
`reply-notifications.ts` owns notification pagination and the publication/upvote
read and acknowledgement operations consumed by Activity. Existing payloads,
cursor resets and public entry-point contracts are preserved.

`community-editor.ts` owns creation/editor mounts and preview disposal, composing
the existing creation, presentation, badge, classification, tag and governance
controls. It preserves dirty drafts, confirmed revisions, the creation guard and
late-response invalidation. `community-detail.ts` owns the community hero,
participation display and return header. Each directory/detail owner retains its
own images through `community-photos.ts`, with selective release and existing
abort cleanup. Followers require only the controller's existing request operation.

The shell retains routing, generation/session authority, selected community,
operation serialization, feed bookmarks and post/discovery/DM composition.
`screen.ts` supplies only a mounted host, lifetime signal, validity check and
shell presentation transition; extracted owners receive no writable application
state bag. A workspace-owned DM remains open when the communities page leaves;
a page-owned DM leaves with that page. Existing controller authorization and
domain rules remain with their current owners.

Structural review: pagination, editor state and photo cleanup moved into their
responsible owners. The shell composes their operations without coordinating
their internal steps. Existing dependency-cruiser rules cover the new internal
imports; no cycles, rule exceptions or new dependencies were introduced. There
are no server, database, migration, cryptography, storage, retention, style or
deployment changes in this stage. The shell's remaining routing/session and
feed-return composition is intentional; this does not claim to resolve separate
controller/engine hotspots.

Validation: 116 focused tests passed across the community screen and related
post/discovery, participation, media, follower and frontend contracts. All 26
assembled community-screen cases also passed against the pre-refactor entry
point using the same final fixture. The eight added cases cover DM ownership,
obsolete directory/notification results, creation after departure, list and
notification pagination, Activity acknowledgement payloads, photo retention and
editor confirmation without remounting. ESLint, strict types, dependency
boundaries, repository formatting and the web build passed. The generated
portable-source archive has 1,159 entries and contains byte-identical copies of
the six new frontend modules; source roots and resource budgets were unchanged.

Browser access became available during this stage. A local comparison of the
before/after bundles with synthetic data showed the same community, management,
creation, notification and personal-list screens at the default desktop
viewport. Typed creation/edit drafts survived refresh, and confirmed presentation
changes updated the header and directory while retaining the editor. Screenshots
are private local evidence, outside Git. This limited fixture does not establish
equivalence across all themes, devices, real wallet/backend operations or media
uploads. PostgreSQL integration and remote CI were not run for H03. No new merge,
push or VPS operation is included.
