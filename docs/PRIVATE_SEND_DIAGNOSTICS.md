# Private and group send accounting

Current collector: **10**, send protocol **4**. The revision 10 section below
supersedes the earlier queue coverage description. Revision 8 defines the
retained send and operation budgets.

The original revision 6 change implements the private-send instrumentation assignment. It preserves
send admission, priority, cryptographic checks, pinned preflight retries, upload
ordering and acceptance behavior. It does not change a performance policy.

## Ownership and collection

`client/chat-sync-diagnostics/private-send.ts` owns capture-local draft and batch
capabilities, exact submission-event correlation, queue observations and disposal.
The composer supplies the actual submit event; the console observer links that
same event to its deduplicated click/Enter/submit gesture. Overlapping sends never
borrow the latest click. Missing gesture linkage remains missing evidence.

The text queue emits admission/save lifecycle callbacks. Its existing save and
transmit owners remain unchanged. The synchronization owner exposes its actual
blocking predicates and marks receipt settlement, maintenance settlement and
foreground acquisition. The private outbox links only the entries returned by
each actual bounded preflight page. Each of the existing two preflight attempts
has its own slot; shared pin load, pin save, directory checks and transmission
retain the batch link. Authority-work events carry the same local capability.
No capability enters persistence, request payloads, signatures or the server.

The message API marks dispatch after signing, response headers and completed JSON
consumption under the linked send/batch. SDK opening, recovery, SDK preparation,
packet preparation, device keys, existing crypto stages and attachment
reserve/part/finish requests retain their own boundaries. HTTP success is not
application acceptance. A stored packet or an already accepted draft explicitly
marks device-key preparation skipped. Pending bubbles and accepted checks are
observations of the visible DOM, not physical paint or recipient display.

Capture stop, expiry and session change dispose draft/event maps and invalidate
old capabilities and unfinished diagnostic closures. Collection uses the existing
opt-in control, with no remote export. Without a capture, diagnostic wrappers run
the original operation directly. There is no timer, retry or queue admission
introduced by this instrumentation.

## Reading an export

The report keeps schema 3 and increments `meterRevision` to **6**. The app
acknowledges `privateRevision: 1`; old or incompatible clients report automatic
private accounting unavailable. `collectorCommit`, `collectorDirty` and
`appAssets` identify both halves. A newer console collector cannot create hooks
missing from an older installed app.

- `comparison.sends[].privateLatency` attaches the accounting to an exactly
  matched gesture. `comparison.privateLatency.sends` also retains submissions
  whose gesture could not be matched; those have a missing gesture boundary.
- `milestones` retain logical submit, admission, composer availability, first
  pending own row, durable save, readiness, eligibility, dispatch, authority
  comparison, acceptance and check observation where exercised.
- `windows.beforeDeviceKeys`, `windows.toAcceptance` and `windows.toCheck` expose
  elapsed time, linked queue wait, observed execution including I/O and residual.
  Intervals are clipped to the selected window and unioned. Queue intervals take
  precedence over enclosing stage spans. A foreground predicate stops accounting
  as another-operation wait when this send acquires its own foreground turn.
- `operations` is a capture-wide table. Each send references its operation slots;
  a shared operation is stored once. `captureWork.executionWallUnionMs` unions
  execution intervals of completed gesture-to-check/acceptance windows, rather than
  adding per-send totals or nested stage durations. Incomplete windows are excluded;
  `operationWallUnionMs` also includes enclosing waits. Neither is CPU time.
- `batches` lists actual members per attempt. A draft added on a later attempt
  receives only that attempt's work and shared batch preparation. Per-message
  waiting behind an earlier draft has its own fixed category.
- Each window's `authority` retains queue entry, scheduler admission, acquisition
  and release, with observed holders from the same anonymous local queue.
  Concurrent holder details are not additive; missing/cross-document holders
  remain `unobserved`.
- `unattributedIntervals[].bounds` names the stages on either side of every
  residual interval. Missing boundaries, unfinished spans, failures, cancellation,
  slot overflow and observation limits remain explicit. A missing boundary is
  never a measured zero. Automatic coverage is separate from the optional
  perception marker; private revision 1 does not require a manual marker.

The five-send comparison limit and 1,500-event ring remain. Private accounting
has at most 128 batches, two attempts per batch, 1,024 operation intervals and
128 points per send. Authority attribution keeps its existing 512-work budget.
The app's draft map is bounded to 256 and diagnostic spans to 4,096. Overflow
makes completeness uncertain and is reported even after timeline eviction.

## Verification and the next owner capture

Automated regression covers overlapping sends, shared batches, repeated
preflight, a missing boundary, known queue holders, nested interval arithmetic,
global ring wrap, capture/session invalidation and export sanitization. Existing
send, authority, queue, attachment and collector tests protect their contracts.
No manual capture was performed for this change, at the owner's request.

The supplied Android revision 5 baseline used clean commit `c99c59e5` and asset
`app-76688530e4c503b4.js`. Its three text gesture-to-device-key intervals were
1,856 / 2,316 / 2,502 ms, and gesture-to-acceptance was 2,804 / 2,922 / 3,012 ms.
The ordinary 100,578-byte image had 2,526 ms before keys, a 567 ms durable stage,
501 ms single-part upload and 4,066 ms to acceptance. These are supplied baseline
observations, not measurements produced by the new implementation.

Build the updated app and collector from the same source revision with
`npm run build`, `npm run mobile:build` when using the installed client, and
`npm run diagnostic:chat`. Use the existing
[Android capture procedure](MOBILE_LOAD_DIAGNOSTICS.md#capture-from-the-mac).
The owner will capture the first text after opening, two quick texts and one
ordinary image, keeping the sender's conversation visible through its checks.
Confirm `meterRevision: 6`, private accounting availability, the collector commit
and the app asset before comparing. After-capture timings and any remaining
large residual are intentionally pending that owner-run capture. Instrument the
specific residual bounds before proposing a speed change.

## Revision 7: receipt turns, local admission and attachment staging

The revision 6 Android follow-up used clean collector/app source
`929106c1360c6508fbccb91aaa3aedc6988e51b6` and asset
`app-aff3253ca41f4d1d.js`. Its private summaries survived 4,073 global event drops.
Text acceptance took 3,467 / 4,450 / 4,606 ms; the second and third included
2,133 / 1,863 ms waiting for receipt completion. Local saves took 562 / 203 /
796 ms, with about 1 ms sealing. The 100,578-byte image took 4,269 ms to
acceptance, including 593 ms before attachment staging, 457 ms of previously
unidentified authority acquisition and 607 ms residual. These are supplied
baseline measurements, not candidate results.

Collector **7**, app private protocol **2**, adds the following evidence:

- `privateLatency.receipts.turns` independently retains the exact inbox turn,
  direct/group scope, live/speculative status, attempts, snapshot retry reason,
  bounded page/item counts, durable commit, failure/cancellation, inbox release
  and completion. Fetch, verification, SDK/key inbox, decryption, persistence,
  acknowledgment and confirmation spans include request categories. Each turn
  includes its linked authority events, with the same capture-relative clock.
- Each send's `receipts` distinguishes the turn active at its gesture from the
  exact turn awaited by its foreground batch. It reports that turn's age at
  the gesture and only the remaining overlap after the actual wait began.
  Several sends reference one shared turn; its internal work is retained once.
  A hint that arrives during a turn still requests its successor.
- The existing local authority gate records platform lock queue/acquisition,
  checkpoint loading, history verification, stored identity and keyring opening.
  `local-storage-open`, `outbox-transaction`, `outbox-write-ready` and
  `outbox-commit` distinguish opening storage, the transaction, issuing writes
  and strict durable `IDBTransaction.oncomplete`. A generation that is no longer
  current never receives a successful send commit annotation. Existing atomic
  quota/order/ciphertext writes and save-generation guards are unchanged.
- Attachment submission owns enqueue, observed eligibility/blocker intervals,
  admission and staging invocation. It supplies its scheduling batch to the
  foreground receipt wait and outbox. Unsupported availability observations
  remain an explicit category instead of an inferred blocker.
- Authority records distinguish maintenance-gate, turn-gate and innermost
  storage-lock waits. Followers are labeled as already inside their leader's
  native turn. Operation completion and actual platform release are separate;
  another document's holder identity remains unavailable. Same-document work
  uses existing anonymous queue/operation slots. Nested waits remain detail
  under the enclosing queue interval and are not added to the elapsed total.
- Milestone completeness and `windows.*.accountingCoverage` are separate.
  Complete milestones can coexist with residual time. The residual retains
  its bounding stages and is never relabeled execution just to reach 100%.

The receipt owner is `messages/inbox.ts`; domain state and continuations remain
with `MessageSyncReceiver`, `Messages` and `GroupController`. Diagnostic
capabilities expire on session/capture changes. The storage owner marks its own
transaction boundaries. The new submission observer owns only its bounded
observation closures, closing them at admission or reset. No controller state
bag, new data cache, dependency, timer or transport policy is introduced.

Receipt summaries have at most 128 turns, 128 detail points and 16 separately
retained terminal points per turn. Truncation/overflow and unfinished span
boundaries remain explicit. Authority summaries retain at most 512 operations,
now with at most 16 phase points each to include platform boundaries. Older
private protocol 1 retains its available evidence but cannot advertise the
new automatic attribution. Outgoing group sends retain the existing group
collector; this increment does not provide the full private-send decomposition
for an outgoing group message.

### Optimization decision from the inspected code

The direct domain already processes one bounded account page per turn. Its
packet storage/ACKs precede final snapshot confirmation and durable progress.
The inbox waits for the enclosing operation, including its one permitted
snapshot retry; a first page-level timestamp does not prove the whole lease
can be released. Group preparation already uses one index page per turn, then
saves pending verified identity pins outside that vault operation. Releasing
the inbox before that save would require a reviewed recovery/continuation
contract. Counters, sound and visible receipt follow-ups already execute outside
the active inbox turn.

Consequently this increment preserves settlement, retry count, admission and
priority, including maintenance priority for group receipt. There is no supported
latency fix yet: the supplied aggregate wait does not identify redundant domain
work or a measured internal cost. It would be incorrect to claim a two-second
improvement by cancelling live receipt, skipping verification, or releasing
before progress/pins are safely settled. The new trace provides the missing
internal evidence for the narrow next optimization.

### Validation and owner capture

Deterministic tests exercise live direct and group receipt, two sends sharing
one awaited turn, a hint during the turn, snapshot retry, persistence failure,
revocation/session changes, global-ring eviction, platform-lock acquisition,
transaction completion and attachment admission. Existing sender accepted-retry,
authority scheduling, receiver cursor/recovery, group preparation and attachment
lifecycle tests remain the correctness checks. These tests demonstrate contracts
and interval attribution, not physical-device latency improvements.

No manual trial or real-message interaction is part of this follow-up.
Authorized Android package updates verify source assets, signing identity and
installation data identity; they do not establish manual-flow acceptance.
At the owner's request, matched Android baseline/candidate trials are
left to the owner: at least three idle texts, texts during a verified active
direct/group receipt, two rapid texts and the same-size image. Retain the same
account, device, network and build mode; compare median/range, failures, receipt
progress and duplicate/lost sends as specified in the work order. Capture
collector revision 7/private protocol 2 plus collector commit and app asset.
Candidate latency, instrumentation overhead and before/after improvement remain
unmeasured. Browser and iOS acceptance are separate from Android measurements.

## Revision 8: speculative admission and private-group sends

The supplied Android baseline used clean collector source
`fac25fd90f6fe1975ae31454d750ddcce3171228` and reported asset
`app-5d98666c626dc724.js`. Collector and application provenance are separate.
The direct texts took 4,565 / 3,601 / 1,990 ms to acceptance; the ordinary
100,578-byte image took 4,207 ms. Text 1 waited 1,708 ms for the storage lock
held by a non-live group receipt. Text 2 explicitly awaited a live direct
receipt for approximately 1,535 ms. These supplied observations identify two
different dependencies; the 84 ms after direct receipt commit does not explain
its whole wait. No matched candidate latency is inferred from the tests below.

### Runtime change and remaining constraints

Private text admission now asks the inbox to yield before local saving queues
for authority. Previously only foreground transmission made that request, after
local saving had already waited for the same lock. `MessageInbox.admitDraft`
uses the existing speculative cancellation path and domain generation/signal
guards. The domain still cleans up and releases its native resource; the save
uses the same exclusive lock and strict transaction. It cannot bypass either.
A pending hint and unfinished page remain in `HistoryPreparation`. After four
speculative interruptions, the next active speculative turn is protected from
further draft interruption until it completes; session reset clears the count.
Live receipt is never cancelled by this operation and retains existing durable
settlement. Existing authority queue fairness and receipt continuations remain.

The group work holding storage is `GroupController.synchronizeAll` plus its
message-window/lease collaborators. `groups/receipt.ts` owns selected updates and
counters, rather than this locked prefetch operation. Group head/membership,
snapshot confirmation, cache writes, SDK persistence, ACKs and identity pin saves
retain their existing boundaries. No network read or cryptographic operation is
moved outside authority and no snapshot is reused with weaker validation.
The live direct receipt and the low-contention text's packet preparation remain
runtime costs requiring further measured, safe optimization. This change does
not claim to eliminate either cost or the whole observed storage wait.

### Group correlation and stage ownership

Group composer submission passes the actual DOM submit event to the same capture
owner as direct sends. The console observer deduplicates click/Enter/submit and
passes that exact event capability. The queued draft keeps its own anonymous
slot through local save, navigation, publication retry and batch processing.
`GroupDeliveryTrace` links its existing group-message number to that send slot.
Adopting an outbox draft without its original admission explicitly marks
`start-not-observed` with missing gesture/admission coverage. Whether admission
predated capture or used an uninstrumented entry remains unknown.

The existing group text queue emits local-save lifecycle marks. `GroupCache`
measures sealing and passes the narrow context into atomic batch persistence;
the storage owner marks opening, transaction, issued writes and actual strict
commit. Group authority receives the batch capability, and per-message request
capabilities are explicit operations on that authority, without ambient async
state. Identity loading, group verification, member directories, recovery/SDK,
device trust, packet creation/persistence, send entry, media transfer and publish
retain their actual boundaries. A retained packet or accepted retry explicitly
skips device-key work where applicable. Existing accepted-packet recovery is
unchanged and never treats HTTP success as validated acceptance.

The group chat view observes pending rows and authoritative accepted checks in
the visible DOM. Missing/hidden observations remain missing; later visibility
records the later observation and does not invent an earlier paint time. Text,
ordinary media and view-once selections have distinct mode labels. Ordinary
media and text have the linked send path. View-once remains partial when one
logical submission creates multiple drafts: those extra drafts have explicit
missing-start coverage rather than an invented gesture link. GIF/voice paths
without a matched logical submit also remain incomplete. Recipient events and
clocks are independent and are not a delivery proof for the sender's message.

Named request categories come from the actual group callers, including group
message snapshot/delta/index/objects/recent/confirm/accepted/publish, governance,
directories, group media and wrapped Matrix operations. Shared preparation is
linked once to actual batch members; a per-message request uses that message's
capability. No nearest-timestamp or last-click attribution is used.

### Retention and accounting

The existing collector and interval engine now retain **32** logical sends
across direct and group scopes. Application queue limits are unchanged.
`privateLatency.scopeCounts` reports observed, retained, milestone-complete,
incomplete and overflowed counts by scope. Each send has 128 detail points plus
16 reserved terminal points, so noisy detail cannot evict acceptance or failure.
The bounded shape permits at most 4,608 send points plus 4,096 shared operation
records. Active request attribution remains limited to 64 entries; there are at
most 128 batches, 256 members per batch, two attempts per batch and eight retained
batch-attempt links per send. Other receipt and authority limits remain as
specified in revision 7. These are diagnostic memory budgets, not outbox quotas.

Send, detail, attempt, operation and batch overflow remain separate, with affected
send slots where known. Missing linked work/authority coverage is explicit.
The 1,500-event global ring is unchanged. Completed summaries and reserved
outcomes survive wrap. No diagnostic mapping is persisted; session/capture
invalidation makes old capabilities inert.

Both scopes expose windows to durable save, first pending bubble, dispatch,
first device-key stage, acceptance and visible check. Queue/lock waits,
execution including I/O and residual are clipped and unioned within each
window. Shared work is stored once and referenced by send. Legacy stage-duration
detail is also clipped to submit/acceptance; later receipt or cleanup activity
cannot inflate click-to-acceptance. Milestone completeness remains separate
from residual accounting and mode/platform limitations.

### Verification and platform acceptance

Automated coverage includes mixed overlapping sends and ring wrap, send/detail
budgets, terminal retention, group category validation, accepted retry after a
lost publication response, stale/revoked packet retry, native lock cleanup before
local save, pending hints, protected live receipt and the interruption bound.
Existing group cache/crypto, UI lifecycle, text queue, window, authority,
preparation, direct receiver and strict outbox tests remain applicable.

The controlled admission test demonstrates that saving can proceed after the
speculative operation's real cleanup instead of requiring its full remaining
network operation. It does not establish a physical-device millisecond speedup,
instrumentation overhead or unchanged incoming latency under continuous load.
The owner's five matched trials per affected scenario remain required for the
performance objective, including direct sends during both kinds of receipt,
group text/image and an eight-send mixed capture. Report median/range, failures,
receipt progress and remaining residual; keep diagnostics-off overhead separate.

Web and installed-product builds plus shared-path tests validate source/build
correctness only. Android, browser and iPhone runtime performance must be
accepted separately. No manual message flow is exercised by this implementation;
new Android package preparation/installation follows the owner's existing
in-place update authorization, preserving app data and signing identity.

## Revision 9: acceptance presentation and bounded handovers

The revision 8 Android baseline combined the clean collector at `10531d20`
with application asset `app-940af97c36445af5.js`. All nine submissions were
retained. The four group texts took 1,599–3,711 ms from protocol acceptance
to accepted DOM observation. Pending rows already used one check under the
approved presentation policy. The recorded interval measures when the row
reflects acceptance, independent of when its first glyph appeared.

The outgoing projection reports which held text changed to accepted. The
group view coalesces that change on the next animation frame for the visible
group. Navigation, session reset, suspension and remount dispose the queued
frame. The existing history renderer preserves scroll and menu handling.
Pending and accepted text still display one check, with distinct accessible
labels. The collector observes an accepted row after it renders. Background
or disconnected views can retain protocol acceptance with unobserved DOM
coverage.

### Resource boundaries

The foreground scheduler accounts for queued interactive sends before they
become durable. A pending send prevents starting another live receipt page
until the scheduler owes a receipt after four send turns. An active page still
finishes and releases its authority. Each page retains its signed snapshot, SDK
lease, ciphertext verification, batched backup acknowledgment, confirmation
and durable progress boundary. An incoming hint advances the preparation
version and survives a turn finishing against the earlier version.

Both ordinary authority and local text verification use the same account
storage lock. A foreground direct batch can close its SDK and release that
lock after the current message's validated publication or accepted retry and
local removal, when a newly admitted draft is still waiting for durable save.
The remaining drafts keep their FIFO records and enter the next freshly
verified batch. In-flight publication, packet persistence, fresh directory and
pin verification, snapshot validation and atomic draft commit retain their
existing exclusion. A send already blocked by one active receipt or outgoing
message can still wait for that indivisible operation. The capture does not
justify caching or weakening the authority checks between preflight and
publication.

The optional group directory maintenance cursor advances after a group
finishes. Its authority is released between groups, and an arriving send
can run before another group starts. A yielded cursor stays in the group
controller and the maintenance scheduler readmits it. Selected-history,
invitations and identity pin work keep their current verification and
session checks. Reported maintenance waits can identify fixed owners for
foreground waits; the baseline does not identify which maintenance owner
caused the entire 1,817–1,820 ms interval.

### Report semantics and measurement

Collector revision 9 retains the existing application diagnostic protocol
revision 3. It includes separate timestamps for protocol acceptance, the
pending row and the accepted DOM row. Unlinked receipt spans stay in the
capture summary. In-flight ancillary work is reported separately from missing
send-owned work. Shared batch milestones appear separately with a pre-gesture
flag. Per-send elapsed windows clip to the gesture and endpoint, with
previous-member wait tracked at the outbox boundary. Message-linked execution
and shared-only context are separate wall-time unions. Shared context can
include activity for other members of the batch.

Physical acceptance requires five matched trials covering isolated and rapid
texts, group image, live receipt, speculative receipt and active maintenance.
Record individual values, median and range, failures, incoming progress and
interval residuals. The idle group acceptance-to-DOM investigation target is
100 ms. Collect runtime results separately for Android, browser and iPhone.

## Revision 10: durable text queue gates and receipt storage boundaries

The supplied revision 9 Android sample uses collector source `94cd9b56` and
application asset `app-8184653d2faead66.js`. All eight sends are retained.
Group text 2 has 2,163 ms from durable-ready to the next recorded wait and
2,172 ms total residual. The earlier `scheduler-eligible` mark observed an
empty sampled blocker list. The text queue had not established that its
own sending/failure/dirty gates and network/admission predicates allowed
a new flush. The historical cause remains unknown.

### Queue ownership and runtime corrections

The text queue now reports durable-ready, its actual processed gate,
flush and transmit admission/result through a typed optional hook.
Capture-local queue generation and batch numbers link a later draft to an
already active transmission. The hook records changes in gate state,
including the trigger that processed them. The application scheduler
provides its reason, while the group composer supplies account and network
availability. The queue owns saving, dirty/version, sending and failed
state. It suppresses synchronous reentry through its own changed callback.

An admission that could not start returns `deferred` through the actual group
and direct adapters. It retains durable work and awaits a notification from
the gate owner. An operation that ran and failed still requires the existing
retry. A queue wakeup version retains a gate-release notification that arrives
before deferred admission settles, including after account reset. Reset clears the group adapter's unsent set and invalidates late save
or transmission continuations, protecting the next account from old groups.
The connectivity and foreground lifecycle paths explicitly reevaluate queues.
No new polling timer is introduced.

The legacy durable-ready mark no longer advertises full queue eligibility.
`textQueue.points` contains the actual decision, gate, trigger, generation
and active batch. Protocol acceptance and visible DOM observations retain
their separate milestones. Revisions 3 and 4 retain comparable existing
latency windows. Revision 3 reports absent text-queue coverage.

### Receipt-held storage

`withLocalVault` and online authority acquire the exclusive
`0xdmme-device-authority` platform resource. A native authority turn could
append another already queued authority operation after the receipt completed.
The authority owner now releases that turn when a local save is already
waiting, so the platform can grant that existing save request. Local-save
registration is removed on acquisition or acquisition failure. The next
authority operation verifies its directory again in its own turn.

A direct receipt may process a new discovery page and then attempt recovery
of an older pending conversation. That recovery is an independent durable
obligation. When a draft is waiting, the receiver can leave the old range
pending for the next page, then flush acknowledgments, confirm and persist
the current discovery progress through the existing commit sequence. At most
one consecutive due recovery opportunity yields. The next due recovery
opportunity proceeds even while sends continue.

The existing active discovery page still owns authority, SDK access and
storage until its consistency boundary completes. Request and SDK work
inside that page remains exclusive. SDK close has its own receipt span,
followed by the actual platform-release evidence. The supplied 689/889 ms
local waits include 654/855 ms of linked vault overlap. The 75/76 ms
commit-to-release tails explain only a fraction of those waits. Neither
correction establishes that the entire observed wait disappears, and a
sample with no due old recovery cannot benefit from deferring that recovery.

### Bounded accounting and validation

Each retained logical send has at most 48 queue points, independent of its
ordinary 128 detail and 16 terminal points. The emitting queue tracks at most
32 waiting draft IDs and exports truncation when that budget is exhausted.
The collector exports dropped queue points, missing durable/dispatch
boundaries, cancellation and capture-stop coverage. Accepted outcome stays
in the existing reserved terminal space.

The queue report separates known blocked intervals, observed available time
before flush, and unknown intervals. Only closed gate intervals enter the
queue union. A missing end, unknown gate or exhausted detail budget leaves
unknown time visible. Terminal acceptance can bound the report but cannot
invent a gate decision. Capture-level receipt context never determines a
queue gate by temporal proximity.

Deterministic regressions exercise save during an active batch, deferred
admission, reentrant status, reset with pending save/transmission, a synthetic
2,163 ms known wait and an unknown counterpart, truncation/capture stop,
the native-turn release before another follower and old-recovery deferral
with current-page commit. Existing live/group receipt, stale directory,
lost-publication reply and acceptance-render tests remain applicable.

Matched runtime trials remain owner-operated. Record durable-ready to first
decision, gate wait, available-to-dispatch, protocol acceptance, visible DOM,
local acquisition and actual resource release with incoming progress. Five
matched runs per affected scenario, the same 100,578-byte image and separate
Android/browser/iPhone results are required to establish physical improvement.
The retrospective 2.16-second cause remains unresolved until the new capture
provides the retained queue transitions.
