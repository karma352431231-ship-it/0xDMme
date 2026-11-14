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
