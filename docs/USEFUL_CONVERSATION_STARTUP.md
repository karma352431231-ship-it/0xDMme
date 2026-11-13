# Useful conversation startup

The owner requested the shared directory corrections in the temporary startup
brief on 2026-11-13. Manual startup timing and physical-device acceptance belong
to the owner. The shared frontend scheduling and opt-in diagnostics use existing
authority and persistence contracts. The owner separately authorized integration,
VPS activation and preparation of native artifacts for this second pass.

## Workflow and ownership

The existing vault, contact-page and identity-pin prerequisites remain in
`messages/startup.ts`. Authorized contact rows still publish before pins finish;
histories, previews and group work retain their own verified prerequisites.

`messages/useful-startup.ts` owns one visible-directory pass with independently
eligible direct previews and group-directory work. Verified group previews receive
bounded turns after their summaries are available. The pass starts after initial
directory/pin preparation. Existing authority turns retain verification and
serialized cryptographic state. Optional maintenance follows useful work.

The startup owner retains a step when admission is unavailable, coalesces bursts
into one follow-up pass, cancels stale continuations by generation and resumes
after foreground work. It has no polling or automatic failure-retry loop. A
failed source does not suppress the other source. Hidden/disconnected documents,
selected-chat openings, sends, live connection preparation and urgent receiving
retain the synchronization owner's admission rules. An already admitted group
operation settles before the next foreground owner enters.

`MessageWarmup` retains its one-second optional scheduling and timer cleanup.
Speculative initialization, group maintenance, outbox flushing and daily work
run outside useful startup. They cannot hold its first publication behind an
unresolved unrelated operation. SDK preparation required by an actual read
remains inside that read's existing verified authority lifetime.

## Group directory and previews

`groups/directory-refresh.ts` reads at most 16 current summaries, verifies the
governance/head and profile using existing operations and saves the existing
encrypted catalog. `GroupController` owns pages, cursors, merging, selection and
one bounded page of deferred profile-maintenance IDs. It publishes the verified
directory before selected-history reconciliation, invitations, pending profile
publication and daily settings/counters. Deferred profile work reacquires current
authority and verifies the group again before mutation or history use.

Online startup reads the bounded catalog page after verifying the remote page.
Rebuilding the catalog from saved history runs after publication. Offline
startup and explicit pagination can import the saved catalog when needed.
Catalog entries use the existing read-only local-copy status. Account changes
cancel pending directory publication and maintenance.

`ConversationPreviewLoader` continues owning its memory-only projection,
single-flight/coalescing rules, selected-chat exclusion and revision fence. Its
startup preparation can await an already running/coalesced read. Rendering never
acknowledges a message as read. Both snapshot confirmations remain in their
existing positions. No persistent preview projection is introduced.

## Diagnostics and acceptance

The existing opt-in recorder adds `useful-directory` and `group-directory`.
The useful pass records admission wait and separate preview/group work stages;
`initial` distinguishes the first pass after session/reset from later passes.
Group and preview operations record verified row counts, including zero, DOM
publication and the next visible-frame opportunity. Hidden lists remain
incomplete until presented; failures and cancellation remain explicit.

`optional-maintenance` records its scheduler interval separately from work.
Existing authority diagnostics continue reporting queue/run durations. These
nested/overlapping spans must not be summed. A useful-pass completion is work
completion, not proof of physical pixels or completion of all background work.

All fields use fixed categories and anonymous counts/timings. Existing event and
operation limits, overflow reporting and capture cleanup remain unchanged. Native
metrics unavailable on a platform remain unavailable. No content is logged.

Android, iPhone/iOS and browser/PWA startup speed are **not manually tested** by
this implementation, as requested by the owner. No before/after latency claim is
made. The next owner-run capture should check first contact rows, group rows,
previews, empty/error states and foreground chat/sending behavior. Further
authority/snapshot reuse requires that evidence; no permission cache or removed
confirmation is part of this correction.

## Second pass on opening, contacts and group previews

The owner approved the second-pass work order in section 14 of the temporary
startup brief, integration into main, VPS activation and ready-to-install native
builds. The latest integrated baseline includes the first useful-startup pass
and subsequent contact-dialog and inline-editor work.

Approved-contact listing now uses the existing SigningLane. The operation only
signs and sends a permission-checked request. It opens no secret or SDK state.
The lane checks the current device directory, and the server validates the
session, directory and contact permissions. Vault-backed implementations preserve
the supplied priority. This removes a confirmed queue dependency between the
contact endpoint and archived-peer/vault reads. Agenda, approved and archived
sources still settle together, with the existing generation, merge, failure,
ordering and identity-preparation contract. A network response can still be slow.

UsefulStartup admits independent direct-preview and group sources before awaiting
either source. Source completion, failure, reset and follow-up requests stay in
this coordinator. Group operations use the existing MessageSynchronization
maintenance owner. The group directory releases authority between its bounded
list read and each verified group/profile read, allowing already queued direct
preview confirmations to proceed between entries. The page still publishes only
when all its summaries are verified. Optional maintenance starts after useful
sources settle, and selected-chat work and urgent receiving retain precedence.

GroupPreviews owns one page of at most 16 eligible groups and a round-robin
continuation queue. Each admitted turn uses GroupMessageWindows.latest with the
existing authorization, full change-index, relations/removals, packet validation
and final confirmation. A large first index can need several turns; other groups
get their turns before it continues. Latest preview work never walks older
message-body pages to satisfy a retained history floor and does not write a new
reopen checkpoint. The existing window owner shares verified candidates with
selected and background history work. Delivery processing remains possible;
read acknowledgement and view-once opening are outside this path.

The preview owner retains at most 128 small projections in memory and clears them
on existing account, authorization and removal boundaries. Selected/background
publications supersede delayed list reads. Failed verification clears the affected
projection; an authorization denial clears the page and projections. Per-group
presentation lifetimes survive subsequent group publications. Index continuations
retain one diagnostic operation per group, preserving the 64-operation budget.

Collector revision 4 records its source commit and dirty state, supported group
startup categories, per-operation initial state, verification, publication and
frame opportunity. Installed diagnostics also report available document/script
resource timings alongside entry, bridge and module durations. These clocks
cannot independently attribute parse/evaluation CPU time or physical tap-to-pixel
latency. The inspected shared definitions and collector accept useful-directory
and group-directory events. The supplied capture lacks collector provenance and
has dropped events, so their earlier absence has no established single cause.
The updated aggregation regression covers group categories and long continuations.

The source evidence supports the queue and scheduling changes above. It does not
attribute the two unmatched captures' pre-entry difference to a particular native
or JavaScript component. The owner's earlier instruction reserves manual startup
testing for the owner. No matched three-cold/three-warm physical comparison or
before/after speed claim is made for Android, iPhone or browser/PWA. The prepared
Android diagnostic build and exact collector support that acceptance capture.
Native installation and real-device acceptance remain separate from packaging.

The directory/controller integration composes existing operations. Queue state
and plaintext projection stay in UsefulStartup and GroupPreviews respectively;
GroupMessageWindows owns candidates and verification, and the authority owner
keeps its original exclusive lifecycle. Existing broader controller/UI coupling
remains preexisting. A later structural task can extract selected-window operations
from GroupController before its mutation workflows, preserving window, admission,
removal and history-lifecycle tests.

## Same-pass identity preparation reuse

The revision 5 capture attributed 2,564 of the 2,566 ms before the first group-list
request. Identity preparation took 2,232 ms, including 1,340 ms queued and 890 ms
executing. The 1,102 ms direct-preview overlap establishes contention, not a
promised saving. Contacts and groups own different PeerIdentity instances.

PeerIdentity now offers one disposable, in-process startup preparation containing
only parsed, persisted pins indexed by their verified immutable vault commits.
The message controller owns the unclaimed preparation, replaces it on a new
startup and disposes it on close/account changes. The group directory consumes
it once and disposes it after that pass. Pending remembered pins are never shared;
the receiving owner keeps its own conflict checks, loaded index and pending writes.
The retained map is bounded by the current identity heads already loaded in that
pass. No new persisted plaintext, authorization cache, timer or telemetry is added.

VaultSync owns the evidence contract. A successful verified operation binds the
local complete heads to session generation, account, device, CSRF, device directory,
vault sequence/head and personal-removal cursor. Evidence is unavailable for local
copies, incomplete heads, failed/in-progress vault work or an outstanding draft.
Consumption acquires the ordinary GroupAuthority turn first. It checks those
bindings, reads the current remote vault checkpoint, and refreshes the authenticated
removal index. Changed evidence uses normal full identity synchronization and pin
opening after releasing the turn. Authorization/network/removal failures reject;
they never become a successful cache result. Session changes after an asynchronous
check reject before hydration. The ordinary server-side session/device checks
remain on every request; the evidence is not an offline permission grant.

With valid evidence, the group owner hydrates its own persisted pins without a
second vault refresh, block decryption or separate identity authority admission.
Governance, current membership, profile reads and message confirmations are kept.
After the last profile, the same vault-head/removal check runs again inside that
entry's existing turn, before returning any current directory rows. Changed evidence
there rejects the page rather than publishing rows from stale preparation. An empty
page has no rows to authorize. Directory reads continue to release authority between
entries, and queued previews and interactive chat opening keep their original lanes.

The revision 5 meter is unchanged. On reuse, identity execution is within the
already-required group-directory turn; its queue is therefore attributed to that
turn, not to a separate group-identities request. Final publication validation adds
two bounded remote reads (checkpoint and removal page, with the existing bounded
removal pagination), and is intentionally outside the pre-list interval. Comparing
only the first list request would miss that cost. Compare group rows/previews,
contacts/direct-preview frames and identity/pre-list queue and execution together.
Always verify both the collector commit and the app asset/build manifest.

Automated regressions exercise real encrypted pins and vault evidence, stale local
and remote heads, directory changes, drafts, removal changes/errors, revocation,
session/device replacement, disposal and pending-pin isolation. Directory tests
cover full fallback, verification, publication rejection and interactive/preview
admission. Physical matched-run medians and ranges remain owner-run acceptance,
consistent with the earlier instruction not to conduct manual boot-speed tests.
No Android/iPhone/browser speedup is inferred from synthetic test timing.

Structural review: evidence validation stays in VaultSync, pin provenance and
handoff validity stay in PeerIdentity, and directory verification stays in the group
reader. Existing message/group controllers only transfer and cancel the capability.
The startup scheduler and exclusive queue have no new domain dependency or policy.
The diagnostic clock now resolves lazily after the opt-in guard, preserving startup
without browser diagnostics (covered by the existing startup regression tests).
