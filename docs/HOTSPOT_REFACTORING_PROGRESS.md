# Hotspot refactoring from the current main branch

Base: `e18f644`. Branch: `codex/hotspot-refactors`. Requested sequence: H08,
H02, then H01 presentation. This branch is for review; merging into main and
VPS publication are outside this task.

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

The three requested implementation stages are committed on this branch. Visual
acceptance remains pending because browser access is disabled. Database
integration and remote CI are unrun; no production-readiness claim is made.
