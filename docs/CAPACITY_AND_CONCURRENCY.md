# Capacity and concurrency

## Owner decision — 16 October 2026

The owner asked to start removing the artificial limits identified in the
capacity audit. Individual storage quotas, authorization, encryption, consent,
retention and abuse protection remain in force. Capacity should follow the
resources available to this application rather than small test-environment
visitor counts. This does not promise unlimited capacity or loss-free operation
when hardware is exhausted.

Implementation is split into reviewable blocks. Removing a global lock without
preserving its consistency guarantees is outside the transport block below.
The owner chose to prepare the remaining blocks locally and activate the
integrated result once, after its verification. A source push does not activate
any block.

## First block: HTTP admission and proxy identity

- The web listener no longer refuses the 33rd socket or closes a connection
  after 32 requests. HTTP header/body limits and request deadlines remain.
- Account, community, public-profile and public-media handlers no longer reject
  the fifth unrelated in-flight operation. Each request still runs the existing
  authorization, content-size, visibility and error handling paths.
- Call synchronization no longer spends a transport-wide 900-request window.
  The edge retains its per-client abuse protection. Authenticated call commands
  retain their separate budget, and synchronization/end remain exempt from it.
- Login challenges keep their six-operation window per client. TCP requests
  use the actual socket peer. Only the explicitly configured private Unix proxy
  can supply `X-0xdmme-Client-Address`; Nginx overwrites client-supplied values.
  Missing/invalid proxy identity fails closed rather than grouping visitors
  into a shared `unknown` bucket. Raw client addresses are neither logged nor
  retained by the rate limiter; its ephemeral keys remain HMAC-protected.
- Protected-client entries use a conservative memory-derived budget, replacing
  the fixed ceiling of 256 clients. Uniform one-minute windows use a monotonic
  clock; expiration visits only the expired prefix rather than scanning all
  live clients on every request. A single owned timer also collects idle
  windows, yielding between bounded batches after a burst.
- The dedicated HTTPS template removes the site-wide 16-connection ceiling and
  the per-response 256 KiB/s throttle. Per-client edge abuse protection remains.
  The body envelope is aligned with the already approved 8 MiB configuration.

**Ponto importante:** these are source/template changes. Editing a template
alone does not change the running VPS. Install the trusted proxy header before
activating the new web code, or protected login operations will fail closed.
Infrastructure activation must compare the current own-site configuration,
validate Nginx, preserve the other project, use the approved graceful reload and
retain a rollback limited to our own additions. Code activation continues to
use `npm run deploy:staging` from an integrated, pushed commit with passing CI.
No new deployment script or database migration is part of this block.

## Verification

Regression tests hold 16 operations pending in each affected HTTP handler and
verify that all reach their responsible service; unauthorized account requests
still return 401. A transport test opens 40 independent sockets concurrently.
Proxy tests cover independent login budgets, IPv4/IPv6, spoofed TCP headers,
missing/invalid forwarded identity and the removed 256-client ceiling.

These tests establish the removed admission barriers, not a supported user
count. High-load validation needs realistic mixes of open streams, messages,
media, calls and history growth, using synthetic data and aggregate metrics.

## Second block: concurrent authenticated reads

Authenticated contact reads now share admission and account locks. The same
contract covers private-message snapshots, index pages, changes, receipts,
delivery metadata and device history; Matrix inboxes and device-key queries;
current/historical recovery capsules; notification preferences and eligibility;
and call authorization. Independent reads, including reads from the same
account, can progress together instead of forming a single exclusive queue.

The transaction acquires its authorization locks before entering PostgreSQL's
read-only mode. SQL writes through this contract fail rather than bypassing
mutation coordination. Device revocation still conflicts with the account
lock. Contact mutations and content admission retain their exclusive lock, so
a read cannot mix consent states across its queries. A read waiting behind a
device change validates the newly committed directory before returning data.
Failure rolls back and releases both locks and the connection.

Message-body downloads and backup windows still use the mutation contract:
opening an object can create a durable delivery reference and charge bytes.
Claiming a one-time Matrix key also remains a mutation. Treating these methods
as reads would break delivery/accounting guarantees.

Integration regressions verify concurrent reads under an existing shared
admission/account lock, rejection of SQL writes, exclusion of a conflicting
mutation, account revocation protection and authorization after a queued read.
This block needs no schema migration. It does not yet remove serialization
between unrelated writes or the singleton content counter.

## Third block: push admission and prepared service resources

The owner explicitly approved preparation of the TURN/push resource changes
after reviewing their shared-host impact. Their activation remains deferred.

- The push sender replaces four active sends and 600 requests/minute with a
  memory-derived in-flight budget, and removes its eight-socket ceiling. Each
  admitted request reserves one MiB of headroom against the smaller of available
  process memory and remaining V8 heap. Pressure returns 429 before an external
  send; success, invalid requests and transport errors release the reservation.
  There is no new pending sender queue. Authentication, provider restrictions,
  fixed generic payloads, byte envelopes and network deadlines remain.
- The push unit template removes its own CPU/RAM/task/V8-heap caps. The TURN
  template removes its own CPU/RAM/task/descriptor caps. Effective inherited
  host/slice/descriptor limits must be checked before activation. Swap and core
  dumps remain prohibited; identities, namespaces and network ACLs stay intact.
- The TURN configuration template sets aggregate allocation quota and bandwidth
  quotas to zero and removes CPU/relay-thread overrides. Coturn's
  [pinned sample](https://github.com/coturn/coturn/blob/4.18.0/examples/etc/turnserver.conf)
  defines these quota values and OS-dependent worker sizing. The existing relay
  port window and four-allocation limit per short-lived random credential remain.
  Port expansion must be coordinated with the own firewall and destination tests.

Socket regressions hold 16 sends pending simultaneously, complete 624 sends
inside a fixed minute, and verify overload rejection and recovery after success,
transport failure and exhausted available memory. External delivery is mocked;
no notification is sent to a real provider. The one-MiB reservation is an
admission estimate, not an established peak TLS-memory measurement. Actual
resource use, latency, descriptor pressure and relay packet loss still need
representative operational validation before activation.

## Fourth block: storage and transfer memory admission

The private, group, status and community transfer services no longer share a
four-operation counter. They reserve memory from one process-wide ledger also
used by object writes and the push sender. The ledger checks both available
process memory and remaining V8 heap; callers release their reservation in
`finally`, and release is idempotent. There is no detached or unbounded queue.
Exhausted headroom returns the existing overload error before starting work.

Bounded transfer chunks reserve eight times their 256 KiB part envelope for
decoded bytes, base64/JSON copies and bookkeeping. Status publication/body reads
reserve 24 MB for their larger bounded packet. Object writes reserve two copies
of their actual ciphertext length plus 64 KiB before taking an immutable
snapshot, replacing the eight-writer ceiling. These reservations are admission
estimates, not measured upper bounds for the assembled process; representative
load and peak-memory validation remain required before activation.

Interrupted-object cleanup and attachment deletion stream directory entries,
yielding every 32 entries instead of refusing the 33rd entry. Existing filename,
file-size, symlink and ownership checks remain. Startup retains recent temporary
files and accepted objects; an exclusive attachment lease can still clean that
reservation's interrupted temporary files before resuming.

Regressions exercise 40 simultaneous durable object writes, more than 64
interrupted files, preservation of recent/final files and other namespaces,
memory exhaustion and recovery after filesystem/store failures. Each transfer
service admits 16 pending operations and returns to service after failure.
Quota, byte accounting, writer leases, integrity verification, consent and
retention rules remain in their existing responsible modules.

## Fifth block: owned media execution queue

Independent media preparations no longer fail because another reservation is
being prepared. Web jobs retain their writer lease, reserve pending-job memory
and own their promise until settlement. Shutdown aborts preparation and releases
leases; media parsing/encoding never holds a database transaction open.

Local decoding, including the isolated worker bundle, runs through one FIFO
queue with at most one active command per media directory. Independent scopes
share slots derived from available CPU count and the smaller host/cgroup memory
ceiling: one slot per four CPUs and 8 GiB, with at least one for smaller
development environments. The four-thread command envelope and Linux 8 GiB
address-space/output-file bounds remain. The per-UID 128-process bound is removed
because it coupled independent jobs. Pending commands and worker sockets reserve
memory; overload is rejected rather than allocating an unbounded backlog.

Queued work retains the existing preparation deadline and abort signal. Failure,
queued cancellation, disconnect and shutdown release reservations. Active work
releases its slot only after the child process and its streams close, following
the [Node child-process lifecycle](https://github.com/nodejs/node/blob/v24.14.0/doc/api/child_process.md#event-close).
The worker's fixed four-socket and single-command gates are removed; canonical
command, path, link, byte and network isolation checks remain.

Regression tests verify independent parallel slots, same-scope serialization,
effective cgroup sizing, queued cancellation, overload/recovery, 16 worker
handshakes and simultaneous preparations whose leases are released on shutdown.
The real FFmpeg/database integration exercises the complete media chain.
Representative peak memory, CPU fairness and deadline behavior under sustained
load remain operational acceptance work. Updating web source alone does not
update the isolated worker bundle: final activation must include the reviewed
bundle through the existing `--media-worker` deployment option and private hash
review, without changing FFmpeg/ffprobe or the worker namespace.

## Sixth block: scoped private-message participant admission

Consent-coordinated operations acquire both participant account locks in UUID
order before invoking their persistence callback. They share the global consent
gate, so unrelated pairs and unrelated reads can enter together. Opposite
directions of the same conversation wait on the same ordered locks, preserving
sender/recipient quota checks and device-directory coordination without an
account-order deadlock. The session and directory are checked after acquiring
the locks, and current consent is checked before the callback.

Contact/consent mutations, general authority operations and retention work keep
exclusive coordination. They cannot change consent while a pair admission is
running. Attachment admission acquires the content ledger before its byte-owner
rows, matching accounting maintenance's lock order across simultaneous pairs. The global
byte counter still serializes accounting writes and historical quota sums remain
unchanged; this block does not claim to remove those separate bottlenecks.

The lock-order policy lives in its own database module. Integration regressions
hold one pair admission open while a separate pair and its reads proceed, then
verify that opposite directions of one pair wait safely. Existing message,
contact, device, quota, group and vault regressions protect the surrounding
contracts. No migration is needed for this coordination change.

## Seventh block: resource admission for pending uploads

Private, group, status, social and vault reservations no longer stop at four
pending uploads per account or 256 globally. Each reservation operation first
reserves one MiB from the same process memory ledger used by transfers and object
writes. Pressure rejects work before it opens a transaction; success, database
failure and authorization failure release the reservation. The estimate covers
in-flight metadata, not a retained file or a promise of measured peak memory.

Durable reservations remain bounded by charged bytes, including metadata:
personal or group quotas and the global content budget still apply atomically
before commit. Existing byte limits, signatures, consent, idempotency, exclusive
writer leases, cancellation and abandoned-upload cleanup remain. Removing the
cross-domain count queries also avoids recounting all pending transfers on each
new reservation. The singleton byte counter and historical quota sums remain
unchanged and are still separate bottlenecks.

Vault reads retain their four-item pending preview and 16-item accepted page;
these are response bounds, not admission ceilings. An optional `pendingId` selects
the local draft by account and ID and fills the remaining preview slots with
other reservations. The client sends its pending draft ID so rebase/discard can
find it even behind hundreds of other uploads. Existing read requests and the
response shape remain compatible. Invalid IDs fail validation; another account's
reservation cannot enter the preview.

Regressions seed 256 charged pending uploads before admitting each media domain,
and exercise 257 vault reservations with bounded preferred-draft recovery,
idempotent retries and released bytes after discard. Existing quota, consent,
concurrent global-budget and media lifecycle tests remain required. Memory
pressure/failure tests verify rejection before transaction work and recovery.

**Ponto importante:** no VPS setting or schema is changed. The existing global
environment budget still needs sizing from physical resources before final
activation. This block preserves that guard rather than treating its removal as
unlimited storage. Peak metadata memory, sustained load and cleanup throughput
remain acceptance work.

## Eighth block: resource admission for call signaling

Signaling no longer stops at 16 simultaneous calls, a configurable maximum of
128, 1,024 endpoint channels globally or 64 channels per account. The retired
`HASH_TALK_CALL_CAPACITY` variable no longer affects admission. Each new channel
reserves 128 KiB and each call reserves one MiB from the shared memory ledger.
These estimates account for metadata, fanout references and existing bounded
encrypted signaling envelopes; representative peak measurements remain required.
The one-call-per-account rule and authenticated device/envelope limits remain.

Ending a call, losing consent, expiry and shutdown release its memory. Endpoint
anti-replay metadata keeps the existing extra ten seconds after its lease and
releases memory when collected. Pressure refuses new state with existing generic
errors while current channels can synchronize/end without a new reservation.
The next-expiry calculation uses constant temporary space instead of allocating
an array and spreading every endpoint into a single function call.

Regressions create 1,100 channels in one account and 132 independent calls,
exercise pressure and recovery, and verify budget release on expiry, end and
repeated shutdown. Existing first-answer, replay, consent/revocation, no-duration
cap and HTTP/database tests remain required. Signaling still belongs to one web
process; adding processes requires an explicit ownership design.

**Ponto importante:** these are signaling-source changes. They do not increase
the active relay's ports, remove the remaining web notification queue limits or
prove that the host can carry 132 media calls. Relay configuration, effective
descriptor limits, port ownership/firewall checks and synthetic network/load
acceptance remain part of the deferred integrated activation.

## Ninth block: resource-admitted notification delivery

Ordinary push reads stable pages of 16 markers, ordered by exact PostgreSQL
timestamp and account/device IDs. Page size bounds each query, not simultaneous
delivery: later pages start independent sends while earlier sends are pending.
Each dispatch owns 64 KiB for page metadata and one MiB for each admitted send.
Pressure leaves unadmitted markers untouched and schedules another attempt after
250 ms instead of consuming a delivery attempt or spinning immediately. One
device has at most one send in flight within the dispatch owner. New generations
remain guarded by the existing conditional completion and are reconciled in the
next drain. New markers and send completions wake the consumer while slower
sends remain active; next-attempt queries exclude active devices to avoid an
immediate rescan loop. Page/persistence failures keep active work owned, and a
failed marker commit is not classified as a provider outcome. Explicit flush
and shutdown await that owned work. Shutdown stops new admission and owns both
durable and call delivery cleanup.

Call push replaces the three-active/512-pending ceilings with a one-MiB shared
memory reservation per queued or active notification. Preparing a device batch
either admits every entry or releases all new reservations without altering an
existing invitation. Replacing one device's invitation waits for its current send
to settle and keeps that send's resource reservation until completion. Each entry
owns its expiry/retry timer; enqueue and completion no longer scan all unrelated
entries. Expiry, invalid authorization, supersession, success and shutdown
release inactive entries, while active work retains memory until it settles.

Ordinary notifications keep their three attempts and 60-second retry spacing;
calls keep two attempts, three-second spacing and their invitation deadline.
Device/consent/mute/visibility checks, generic transport payloads, provider
allowlists, network deadlines and generation-guarded persistence remain. Nothing
in this block confirms delivery of an accepted message or expires its content.

Regressions hold sends across three durable pages and 544 call notifications at
once, admit a new device while an earlier send remains blocked, verify atomic
admission under pressure, supersession, expiry and shutdown,
and preserve retired-subscription/retry outcomes. Database regressions verify
timestamp precision, tie ordering, excluded future/exhausted markers and newer
generation retention and active-device scheduling exclusion. Existing assembled message/call/public-notification
integration remains required.

**Ponto importante:** these are source changes. The memory sizes are admission
estimates, not measured network-memory peaks or a supported delivery rate.
Validate queue latency, query plans/history growth, descriptor pressure,
provider throttling and recovery under representative synthetic load before the
deferred activation. No real provider receives a notification in these tests.

## Tenth block: temporary authentication admission

Login challenges, browser handoffs and persisted device links no longer stop at
1,024/256/256 rows. Their creation reserves shared process memory before waiting
for SQL. Remove the global advisory locks and full-table counts used only for
those ceilings; preserve account/session coordination and unique keys. Expired
rows are collected in batches of at most 64 with locked rows skipped. A racing
duplicate device-link insert has one winner and a controlled conflict; the
losing transaction also rolls back any cancellation of an earlier link.

Opening, recovery-return and enrollment state no longer stop at 128 entries.
Each asynchronous creation owns a 128 KiB reservation; each retained entry owns
a separate 128 KiB reservation until its original expiry, cancellation/removal
or shutdown. These are admission estimates, not measured memory peaks. A shared
temporary-state module owns individual expiry timers; browser/device indexes
avoid scanning every unrelated request on each lookup or replacement. Recovery
replay tombstones keep their original deadline. No accepted message or vault
object gains an expiry.

Pressure retains existing entries and uses existing translated errors. Closing
during validation cannot recreate state; closing an enrollment during receiver
issuance cancels that session before durable linking. Failed browser-handoff
persistence releases its newly prepared opening. Signature checks, RSA receiver
validation, browser/session binding, three challenge attempts, abuse windows
and five-minute validity remain in force.

Regressions admit 130 concurrent openings/recovery requests and 140 independent
enrollment sources, and exercise idle expiry, pressure, replacement and shutdown
during validation/issuance. SQL regressions seed the former 1,024/256/256 counts,
hold the retired admission locks and an expired row, and preserve challenge
attempts, account authorization, duplicate-link conflicts and bounded cleanup.

**Ponto importante:** no schema, environment or VPS activation changes here.
Persisted temporary state retains its existing expiry/index/autovacuum policy
and bounded cleanup on creation; the physical-volume admission review remains
separate. Validate transient memory peaks, admission fairness and expired-row
cleanup throughput under representative synthetic load before activation.

## Eleventh block: exact group quota counters

Group quota checks and accepted-media occupancy read exact per-group counters
instead of historical sums. Statement triggers aggregate charged changes in
UUID order, preserve rollback and avoid writes for unchanged totals. Reserved
or deleting media remains charged until collection; retention counts accepted
media separately. Authorization, existing coordination and the group quota
split are unchanged. The versioned migration backfills existing history under
write-conflicting locks and provides a reference view for reconciliation.

**Ponto importante:** the migration is prepared locally, not applied to the VPS.
Personal quota sums, the singleton global byte counter and remaining group/general
admission locks are still pending. Schema/catalog rollback and backfill duration
need review before the final activation. See [exact quota accounting](QUOTA_ACCOUNTING.md).

## Twelfth block: direct personal quota counters

Personal usage reads exact account/profile counters instead of repeating the
directly owned historical sums. Statement deltas preserve sender/recipient
charges, retained-byte subtraction, owner mapping, no-op behavior and rollback.
New owners start with zero counters; missing accounting fails closed. All
existing individual quotas, authorization and global coordination remain.

**Ponto importante:** block 12 retained the private-attachment sum and
personal-removal exclusion; block 13 below prepares their incremental accounting.
The singleton global byte counter remains pending. Migration 071 needs
schema/preservation/backfill/rollback review before the integrated activation.
Migration 072 preserves global-ledger-before-counter order for deltas that
change no global bytes; unchanged totals do not acquire the added guard.
See [exact quota accounting](QUOTA_ACCOUNTING.md).

## Thirteenth block: exact private attachment quota counters

Personal usage reads an indexed attachment total alongside the account/profile
counters. Attachment and removal triggers reconcile only affected message and
participant pairs, aggregate account deltas and preserve the existing charge
formula through changes, deletion, rollback and combined writable statements.
All statuses stay charged until collection unless that participant has removed
the message personally. Existing message-index and removal-primary-key lookups
replace account-history scans. Unchanged totals do not rewrite derived rows.

**Ponto importante:** migration 073 is prepared locally, with populated backfill,
reference reconciliation and missing-accounting refusal. It retains the global
guard and current READ COMMITTED mutation contract; replacing that guard must
preserve cross-table serialization. Schema activation, backfill/resource/load
acceptance and rollback review remain pending. See
[exact quota accounting](QUOTA_ACCOUNTING.md).

## Remaining audit work

- Size global content admission from the own data volume and operational space;
  remove the stale 900 MB environment budget without weakening individual
  quotas or admitting writes that endanger accepted data.
- Extend scoped coordination to the remaining general authority/group/retention
  operations, with explicit lock orders and revocation/deletion regressions.
- Replace singleton byte-counter contention; validate the prepared group,
  personal and attachment counters and reconciliation under load.
- Measure reservation/transfer/execution memory and queued deadlines under
  representative load; validate abandoned-upload cleanup throughput.
- Activate the prepared TURN/push changes with effective inherited limits and
  rollback; coordinate relay ports and representative resource validation.
- Validate feed query growth, recurring polling, SSE recovery, database pools,
  event-loop latency, WAL/checkpoints and overload recovery.

Those changes are not reported as complete by the HTTP block. In particular,
raising HTTP concurrency does not itself increase database or media capacity.
