# Private send accounting — collector revision 6

This change implements the private-send instrumentation assignment. It preserves
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
