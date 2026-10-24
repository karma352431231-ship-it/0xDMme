# Hotspot refactoring from the current main branch

Base: `e18f644`. Branch: `codex/hotspot-refactors`. Requested sequence: H08,
H02, H01 presentation, H07 group presentation, H03 community presentation, then
H04 public-identity DM presentation, H05 account ownership, then H06 device
linking and wallet-return workflows, the H01 engine outbox/reader, H09 HTTP and
H10 message operations.
Integration of the first four stages is recorded below. The H03 stage remains
local on this branch, followed by H04, H05, H06, the H01 engine extractions and
H09/H10; another merge, push and VPS publication are outside these stages' scope.

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

## H04: public-identity DM history, sending and refresh ownership

Base: `b585fe5`, including H03's page-versus-workspace DM contract. The current
baseline already has `dm-composer.ts` and `dm-composition.ts`, which retain typed
drafts, editing context, prepared media, recording and preview disposal. Those
owners are reused without changing their behavior or creating a second composer.

`dm-history.ts` now owns the displayed page's rows, next-page cursor, content
reuse, media renderer, message menus, reaction controls and external-resource
lifetime. It receives only the history region and narrow media/edit/reaction
operations. Unchanged content retains its nodes and media; changed or removed
content releases its resources. Peer-header photos retain the same cancellation
boundary through this lifetime's signal.

`dm-sending.ts` owns the stable text admission ID and the existing submission
sequence for edits, new media, staged media and text. A failed send does not
rotate the ID; accepted text does. Restoring a durable pending draft restores
its existing ID. Encryption, durable staging, account authority and persistence
remain in `SocialDms`, with no new storage or protocol format.

`dm-refresh.ts` owns the live subscription, hint coalescing, continuation tasks,
fallback interval and browser lifecycle listeners. It reads only immutable
availability facts and invokes the existing reload/invalidation operations.
Refresh still waits while recording or holding a prepared selection, and
security/lifecycle invalidation still closes content immediately. A separately
mounted directory keeps its subscription after the conversation leaves; an
obsolete directory is cleaned up at the existing fallback boundary. The shell
keeps one selected peer, session/generation/verification authority, operation
queue, relation gates, verified reads and read acknowledgements.

Structural review: row/media, send-ID and subscription state moved with their
cleanup and operations, rather than receiving the original writable closure.
Existing directory, composer, projection, inbox, continuation and lifecycle
owners are reused. Existing dependency rules cover the new internal imports;
there are no new rules, exceptions, dependencies or source-archive roots. Server,
database, cryptography, storage, retry policy, styles and deployment code are
unchanged. The shell still composes list/identity/offline opening and verified
conversation admission. If directory presentation changes later, first move its
main-list and local-copy page cursor into a dedicated list owner, keeping the
independent `DmDirectory` and testing preview failure, local mode and navigation.
This remaining preexisting area does not require changing unrelated workflows
in this stage.

Validation: 108 focused tests passed across DM UI/coordinator, composition,
opening, read markers, work queue, authority, history synchronization, directory,
inbox, projections, continuations, attachment/voice resources, H03 integration
and portable-source packaging. All 28 assembled DM coordinator cases also passed
against the pre-refactor entry point with the same final fixture. Ten added
cases cover unchanged-row reuse/disposal, local read-only history, stable retry
IDs, refresh during recording, selected-byte/preview cleanup, fallback shutdown,
staged-media retry, blocked composition, explicit pagination and an independently
mounted directory. These use synthetic IO, media and DOM adapters, including the
real composer for draft/selection cases; they do not exercise real devices or
backend services.

ESLint, strict types, dependency boundaries, formatting, localization coverage
and the web build passed. The boundary check initially inherited the host's
unsupported Node 25 after the first command in a shell chain; rerunning the
remaining checks with Node 24 for the complete chain passed. Final changed-file
lint and strict types also passed. No dependency/runtime configuration changed
to accommodate the host default. The portable-source archive has 1,162 entries
and contains byte-identical
copies of the three new modules and the updated entry point, within unchanged
budgets.

The local browser is disabled in Work settings during H04, so a real browser
comparison remains pending. PostgreSQL integration and remote CI were not run.
No merge, push or VPS operation is included.

## H05: account authority and existing profile/wallet/approval owners

Base: `28cd6a5`. The integrated baseline already separates private-profile drafts,
photo URLs, wallet selection, approval requests, login and account rendering into
their own modules. Repeating those extractions would not establish new owners.
The remaining shared boundary was the writable `AccountCore` object passed to
all five owners, allowing each to change account state directly.

The coordinator now exclusively owns that mutable object. Each collaborator
receives only the immutable facts it reads and explicit operations: login and
approval invalidate pending work through the coordinator; private-profile saves
and statement signing reserve the existing busy window there. Session replacement,
expiry, restoration, provider-change logout and final disposal keep the same
authoritative session/epoch and ordering. `AccountSnapshot` also exposes session
fields as readonly. The DOM query capability only requires the mounted host.

The existing private-profile owner retains its key, decrypted content, name and
preference drafts, photo draft/avatar URL and authority-aware persistence. The
existing writer/photo autosave boundaries are unchanged; autosaving a photo still
does not confirm an unrelated preference draft. Wallet selection owns its open
and selected state and its discovery-change listener, including idempotent
removal. The coordinator retains the shared discovery registry's lifetime and
closes it in the original disposal order. Login needs only registry get/list
operations. Approval documents retain their deadline, cookie/fragment intake,
pending-request and diagnostics owners without creating ordinary sessions.

Structural review: account mutations now go through the one coordinator rather
than a writable state bag shared across features. The coordinator composes narrow
ports; it does not absorb form rendering, private keys, approval rules or wallet
proof construction. Existing internal import rules and TypeScript readonly
contracts cover this boundary; dependency-cruiser does not enforce individual
exported members, so the mutation ownership was also reviewed directly. No cycles,
dependency exceptions, additional dependencies, modules or source roots were
introduced. There are no server, database, device-engine, crypto-format, storage,
stylesheet, migration or deployment changes. H06 device enrollment/recovery
orchestration remains a separate task.

Validation: 92 focused tests passed across account lifecycle, private profiles,
avatar cleanup, settings, wallet return, approval entry, login opening, device
profile-key rotation, wallet statements, SIWE and portable sources. All 34 bundled
account-screen cases also passed against the pre-refactor account implementation
with the same final fixture. Four added cases cover dirty draft/remount behavior,
private-photo URL retention/release, a save completing after session replacement
and discovery refresh/disposal without wallet prompts. Existing cases protect
approval-only documents, restoration without prompts, stale authenticated-response
revocation and signing after account changes. Only the existing account harness
was extended. The approval HTTP test initially could not bind loopback inside the
restricted environment; running that one test with local-server permission passed.

ESLint, strict types, dependency boundaries, repository formatting, localization
coverage and the web build passed. The test fixture's newly used session value
was explicitly typed after the initial type check identified widened string
literals. Final changed-file lint and strict types passed. Source-distribution
validation uses the unchanged archive roots and budgets.

Browser access is disabled in Work settings during H05, so a real browser/wallet
comparison remains pending. PostgreSQL integration and remote CI were not run.
No merge, push or VPS operation is included.

## H06: linking and temporary wallet-recovery workflows

Base: `bb3f096`. `devices/linking.ts` owns the pending link, fingerprint, selected
approval and local deadline. It coordinates enrollment-candidate validation,
inspection/approval and the join HTTP exchange through complete operations of
the existing controller. It clears drafts on confirmation, cancellation and
session change. Transient cleanup preserves the prior deadline semantics.

`devices/wallet-recovery-flow.ts` owns the pending wallet-return request, its
expiry and in-memory legacy input. It composes the existing direct signing,
encrypted return, public metadata restoration and cancellation operations.
The controller's existing pending-request property delegates to this owner for
compatibility; that metadata grants no directory or key-ring authority.
Signatures and legacy input are still cleared at the existing completion/reset
boundaries, and restoration never launches a wallet.

`DeviceController` retains the single account generation, identity, verified
directory/events, trusted root, key ring, authority lock and signing lane.
Workflow modules receive scoped operations and a readonly transport receiver,
not writable copies of directory/trust state. Enrollment identity generation
and root pinning remain in the controller; joining still receives a pending
session rather than vault authorization. Link preparation, signed authorization,
receipt verification and checkpoint persistence execute inside the original
authority turns. Recovery plans, mode/revision/head validation, key rotation,
profile re-encryption, event verification and commit/reconciliation retain their
original owner. `advanceCheckpoint` and all storage/crypto formats are unchanged.

Structural review: temporary request state moved with its operations and cleanup,
while authority mutations remain complete controller operations. The existing
transport and cryptographic modules are reused. A token comparison confirmed
that 24 retained authority, cryptography, key/profile and checkpoint methods,
including synchronization, commit, revocation and legacy recovery, are unchanged.
This supplements runtime tests; it is not a security audit. Existing import
rules cover the new modules without cycles, new dependencies or exceptions.
There are no server, database, device-storage implementation, migration,
stylesheet, policy or deployment changes.

The controller retains its existing verified-directory and key-rotation rules;
this stage intentionally does not move them into independent trust authorities.
If those internals need further work, characterize directory verification and
checkpoint publication before extracting that cohesive boundary, retaining one
owner and running the authority, migration, profile-rotation and persistence
tests. That preexisting concentration is separate from the request workflows
addressed here.

Validation: 88 relevant tests passed across lifecycle, authority, signing lanes,
cross-tab turns, enrollment/QR, profile-key rotation, recovery migration,
authenticated recovery destinations, wallet signatures, encrypted mobile return,
login opening and portable sources. All 11 lifecycle scenarios also passed
against the pre-refactor controller with the same final fixture. Ten new cases
exercise cancellation during enrollment/read work, signature cleanup after
invalidation, an accepted initialization with a lost response and later
checkpoint reconciliation, mobile metadata restoration/cancellation, late return
creation, linking between separate device stores, direct initialization,
encrypted return confirmation and enrollment recipient binding without vault
access. Cryptography remains real; HTTP, wallet and IndexedDB transaction
boundaries use synthetic adapters. The two-device fixture uses independent
stores, since sharing a pinned checkpoint represents an already-known browser.

Changed-file ESLint, strict types, dependency boundaries, repository formatting,
localization and the web build passed. Fixture checks identified a request-body
type/complexity issue and TypeScript's retained null narrowing across an async
refresh; both were corrected without suppressions or product changes. The
portable-source archive
has 1,164 entries and contains byte-identical copies of both new workflow modules
and the controller, within the unchanged source roots and resource budgets.

Browser access is disabled in Work settings during H06. Real wallet/device and
IndexedDB acceptance, PostgreSQL integration and remote CI remain unrun for this
stage. No merge, push or VPS operation is included.

## H01 engine: outgoing message ownership

Base: `cd9f9a7`. This is the first engine slice, not completion of the H01
engine. `messages/outbox.ts` owns encrypted outgoing records from admission
through attachment transfer, publication, retry reconciliation and removal.
It also owns pending-draft reopening and outgoing profile deduplication.
`Messages` preserves its public operations and composes the owner; verified
deletions invoke its narrow record-removal operation at the original point.
The shared encrypted profile-chunk format lives in `profile-chunks.ts`, so
verified profile caching does not depend on the outgoing workflow.

The controller retains the single session generation and identity/history
authority. The outbox receives scoped authority operations and vault access,
without mutable controller state or a second trust owner. Recovery-key and
SDK opening still use the existing authority; transmission closes the machine
in the original `finally` block. Identity pins are still saved outside
`withVault`, before key distribution/publication. Existing batch bounds,
authority rechecks, two-attempt pin preparation, stable packet IDs and encrypted
storage formats are unchanged. Discard still closes the reader and notifies
controls through the controller before reconciling a possibly accepted send.

Structural review: durable outgoing state and its operations moved together.
Reader verification, staged views, final server confirmation, receipts, offline
history and session invalidation retain their existing owner. Token comparisons
confirmed unchanged bodies for 22 retained authority/read methods and 13 moved
outgoing methods after explicit authority/type-name substitutions; the shared
profile sealing body is also unchanged. Existing dependency rules cover the
new modules without cycles, exceptions or dependencies. No server, database,
migration, policy, stylesheet or deployment code changes are included.

Validation: 123 relevant tests passed, covering sending, resumption, outbox
ordering, indexing, verified windows, session/recovery, backups, local history,
attachments, text queues, profile broadcasting and portable sources. The same
55 sender/resumption cases also passed against the pre-refactor controller;
the baseline snapshot matches `cd9f9a7`, and the final cases and fixtures differ
only in import paths and that controller override. Three added cases protect
retry after an accepted publication loses its response, rejected publication
with encrypted-draft retention and SDK cleanup, and remote reconciliation when
discarding a possibly accepted message. Existing lifecycle cases now seed
pending records rather than replace the controller's pending method.
Cryptography and the sender SDK are real; network and persistence boundaries
use synthetic adapters, which do not establish browser durability.

Changed-file ESLint, strict types, dependency boundaries, repository formatting,
localization and the web build passed. Initial static checks caught two imports
still needed by the retained reader; both were restored before the final checks.
The portable-source archive has 1,166 entries and contains byte-identical copies
of all three affected message modules within the unchanged roots and budgets.
Real browser/IndexedDB acceptance, PostgreSQL integration and remote CI were
not run. No merge, push or VPS operation is included.

Next engine slice: characterize and extract the verified conversation reader,
reusing the existing sync/index/window owners. Preserve one session authority,
staged-view cancellation and final server confirmation before publication; run
the resumption, verified-window, index, session and recovery contracts. Remaining
archive/offline responsibilities are preexisting and need a separate clear
contract before extraction.

## H01 engine: verified conversation reader

Base: `25abd96`. `conversation-reader.ts` owns selected-window state: selection
cancellation, pagination, staged visibility, confirmed candidates, probes,
verified/index/offline windows and receiver coverage. Online, imported-archive
and offline opening use this owner because they publish through the same
selection and visibility lifecycle. This does not introduce a separate archive
authority or change their persistence/access rules. Existing index, incremental
window, confirmed-conversation, visibility and offline-index modules are reused.

`Messages` retains the single session generation, peer identities, vault
authority, SDK opening, cryptographic packet validation, encrypted packet/profile
persistence, backup operations and account receiver turn. The reader uses four
scoped packet/cache operations and the existing session/pin authority, without
writable controller state or a second invalidation authority. Missing packets
retain their original SDK preparation/receive/cleanup operation. Profile reads
return rows to the reader rather than mutate its internal collection. Shared
view/event types live in `message-view.ts`; existing controller type exports and
public operations remain compatible, without a reader-to-controller import.

The reader stages complete windows, preserves identity pins outside the vault
lock and performs the separate fresh final confirmation before publication.
Legacy confirmation retries, finite-cut confirmation, interruption/continuation
rules, pagination limits, candidate budgets and stale-work rejection are
unchanged. Receiver progress and recovery alarms remain with the account turn;
its confirmed durable commit calls the reader to update window coverage and
publish. Media and search capture scoped snapshot capabilities from the reader,
preserving candidate identity checks without exposing mutable window state.

Structural review: selection, window state and their cleanup moved together.
The controller no longer reads or writes those fields. AST comparisons verified
46 unchanged retained method bodies and 21 moved reader bodies after explicit
authority/integration substitutions, plus the unchanged missing-packet SDK
lifetime. Lifecycle composition and media/search adapters were reviewed
separately. Existing dependency rules cover the new modules without cycles,
exceptions, new dependencies or broader source roots. There are no server,
database, migration, policy, stylesheet or deployment changes.

Validation: 218 relevant tests passed across reader resumption, final publication,
verified/index/peer windows, visibility, retained candidates, continuations,
receiver turns, sending, sessions/recovery, backups, local history, attachments,
search, delivery scheduling, live sharing and portable sources. All 53 assembled
resumption cases passed against both the pre-refactor controller and the final
reader with the same final fixture and cases; the baseline matches `25abd96`.
Six added cases cover arrivals during finite-cut confirmation, session changes
during archive/offline opening, offline cache/archive merging, receiver publication
only after confirmation and durable progress, and checkpoint-storage failure
preventing new selected-window content from being published. Network, local
vault access and persistence use synthetic adapters; real index, receiver,
visibility and removal-loading logic execute inside that fixture.

Changed-file ESLint, strict types, dependency boundaries, repository formatting,
localization and the web build passed. The initial lint found one obsolete
snapshot import, which was removed before final validation. The portable-source
archive has 1,168 entries and contains byte-identical copies of the controller
and both new modules within the unchanged roots and budgets. Real browser and
IndexedDB acceptance, PostgreSQL integration and remote CI were not run.
No merge, push or VPS operation is included.

Remaining packet/cache, media/search and export responsibilities in `Messages`
are preexisting. If they need another extraction, characterize packet verification
and encrypted cache/recovery first, move that operation before its backup/media
callers, and preserve shared session guards and machine cleanup. Affected tests
include recovery, verified windows, backups, local history, attachments and
conversation search. That additional cleanup is separate from this reader stage.

## H09: account HTTP workflow ownership

Base: `4016137`. `recovery-http.ts` owns public/private recovery, wallet handoff,
opening read/acknowledgment, document entry and temporary-return cleanup.
`enrollment-http.ts` owns invitation lifetime, receiver-session issuance and
device-route adaptation, including shutdown. `message-http.ts` owns authorization
and attachment preflight before reading message bodies, message dispatch and
live-stream opening with continuous session/directory reauthorization.
`call-http.ts` owns authenticated command admission and the call service/budget
lifetime; synchronization and end retain their budget exemption.

Shared cookie transport preserves the historical identities, strict flags,
lifetimes and duplicate-cookie rejection in `http-cookies.ts`. `http-body.ts`
owns JSON/UTF-8 reading, the byte bound and its five-second deadline/timer cleanup;
route policies supply the existing limits. Message and call budgets stay with
their HTTP owners. `http-response.ts` preserves the existing JSON representation.
The entry point composes these owners and retains Origin/CSRF routing, login,
shared challenge protection and the existing remaining feature dispatch.
Domain services remain authoritative; no SQL, cryptography or new permission
decision moved into transport adapters.

Capacity clarification: the old audit's four-request admission statement was
already superseded by the owner's 16 October decision, implemented in `0160d68`.
This stage preserves the current absence of a fixed unrelated-request ceiling
and general per-minute API quota. It also preserves per-client login protection,
trusted Unix-proxy identity handling and separate authenticated call-command
budgets. No capacity policy is reinstated or changed by this refactor.

Structural review: pending recovery/enrollment state and its complete cleanup
belong to their HTTP owners, call timers/budgets to the call owner, and request
buffers/deadlines to the body reader. Modules receive only the services and
cookie operations they use, without writable handler internals. Ten moved route
bodies, JSON reading/deadline logic and the complete message-budget table match
the baseline after explicit interface substitutions. HTTP/HTTPS cookie output
and invalid/ambiguous-cookie rejection were compared with the original functions.
Routing and shutdown composition were reviewed separately. Existing dependency
rules pass without cycles, exceptions, new dependencies or broader source roots.

Validation: 90 tests passed, including 51 PostgreSQL/HTTP integration cases for
account login/opening, encrypted wallet return, enrollment, private messages,
SSE and calls. Those same 51 cases passed before and after against separate empty
dedicated local databases. All 11 focused HTTP/budget cases also passed against
the original handler and the final modules, using the same final cases/fixture.
Ten added regressions cover Origin/authorization/preflight before upload reads,
ambiguous cookies, exact route body limits, deadline destruction and subsequent
requests, timer release on valid/invalid JSON, pending invitation cleanup on
shutdown, and command exhaustion while sync/end and another session stay usable.
Related capacity, proxy identity, temporary-admission, enrollment and recovery
unit tests passed. Focused HTTP tests isolate domain/storage methods; integration
tests exercise real PostgreSQL, HTTP and cryptographic flows with synthetic data.

Changed-file ESLint, strict types, dependency boundaries, repository formatting
and the web build passed. Initial static checks identified obsolete imports and
parameters plus missing fixture callback types; these were corrected before the
final checks. The owned disposable PostgreSQL cluster was stopped after testing.
No migrations, infrastructure, deployment tooling, frontend behavior or retention
rules changed. Remote CI, physical browser/wallet acceptance and VPS activation
were not run. No merge, push or VPS operation is included.

Remaining vault, contact and social transport wrappers are preexisting. If they
need another extraction, move vault preflight/body policy together first, then
feature dispatch, keeping shared Origin/CSRF and authorization order explicit.
Affected checks include account/messages plus vault/community/profile HTTP
integration and body-deadline regressions. That further cleanup is separate from
the four workflow owners addressed here. The next primary plan area is H10.

## H10: signed authority, message operations and personal collection

Base: `ccaf49d`. `messages/authority.ts` owns current-device signature validation,
operation-name binding, live-directory validation and the existing signed deletion
revision check. It is stateless and rereads the existing device store for each
request. Domain ACLs, session/device revalidation and protected mutations remain
in their existing coordinated database operations. `MessageService` preserves
its public authentication, live-check, upload-preflight and operation contracts.

`direct-operations.ts` owns private-message publication, accepted/profile checks,
window/index reads, delivery, acknowledgment and deletion adaptation.
`backup-operations.ts` owns recovery registration/reads, bounded export/ACK and
personal-removal adaptation, retaining all snapshot checks. `matrix-operations.ts`
owns direct/group Matrix input validation, transport operations and current-device
key binding. These modules receive only their required store/service capabilities.
The shared operation contract and snapshot/sequence parsers introduce no mutable
state. The entry point composes operation owners with the existing social, group,
status, representative, notification and attachment services; their ACLs and
construction/teardown are unchanged. Its retained database field is narrowed to
the capabilities its composition and preflight methods actually use.

`personal-backup-collection/index.ts` supplies one implementation for immediate
personal cleanup and scheduled content maintenance. The existing store still
returns a bounded page of eight objects. Each object is discarded before its
collection acknowledgment; either failure propagates and preserves retry
obligations. Personal removal still waits for this collection, attachment cleanup
and social cleanup before returning. The backup owner invokes one complete
composed cleanup operation; it does not control other services' internal state.
Worker topics, wakeups, deadlines, batch bounds and scheduling are unchanged.

Structural review: domain validation moved with its operations, while the facade
retains composition and one signed dispatch boundary. AST comparisons verified
37 moved registry entries, all three authority method bodies, publication,
recovery registration, Matrix upload and collection after explicit capability
substitutions. The dispatcher retains exactly the same 161 operation names.
Existing import rules cover the new modules without cycles, exceptions, new
dependencies or broader source roots. No crypto formats, persistence identities,
quotas, retention, migrations, locks, infrastructure or deployment code changed.

Validation: 146 relevant tests passed. The same 103 PostgreSQL/HTTP integration
cases passed before and after using separate empty dedicated local databases;
they cover private messages, sync/receipts, groups, status, social DMs, calls,
representatives and after-commit maintenance signals. The same 13 added focused
cases also passed before and after: representative dispatch with a valid signed
authority; rejection of a different operation, changed payload, device, head or
missing directory before domain work; signed deletion revisions; prototype and
unknown operation rejection; fresh live-directory checks; collection after actual
discard; object/persistence failures; and immediate cleanup blocking completion.
Additional maintenance, HTTP/preflight/call-budget and recovery-authorization
tests passed. Focused cases use real device signatures with isolated persistence
and domain side effects; integration uses real PostgreSQL and cryptographic flows
with synthetic accounts and content.

Changed-file ESLint, strict types, dependency boundaries, repository formatting
and the web build passed. Initial lint identified one obsolete snapshot import
in the Matrix owner; it was removed before final validation. The owned disposable
PostgreSQL cluster was stopped after the comparison. Remote CI, physical-device
acceptance and VPS activation were not run. No merge, push or VPS operation is
included.

The facade's remaining upload-preflight adapters and service construction are
preexisting composition responsibilities. If preflight grows, characterize its
authorization-before-body contract first, then move each feature's adapter
together with its specific input policy; do not replace it with signed-body
authentication before the body is available. Relevant checks are H09 HTTP and
message/SSE integration. Broader transactional admission work remains H11.
