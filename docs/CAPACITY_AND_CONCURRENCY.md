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
running. The remaining aggregate upload-count check acquires the content ledger
before counting, preserving its atomicity across simultaneous pairs. The global
byte counter still serializes accounting writes and historical quota sums remain
unchanged; this block does not claim to remove those separate bottlenecks.

The lock-order policy lives in its own database module. Integration regressions
hold one pair admission open while a separate pair and its reads proceed, then
verify that opposite directions of one pair wait safely. Existing message,
contact, device, quota, group and vault regressions protect the surrounding
contracts. No migration is needed for this coordination change.

## Remaining audit work

- Size global content admission from the own data volume and operational space;
  remove the stale 900 MB environment budget without weakening individual
  quotas or admitting writes that endanger accepted data.
- Extend scoped coordination to the remaining general authority/group/retention
  operations, with explicit lock orders and revocation/deletion regressions.
- Replace repeated historical quota sums and the singleton byte-counter
  contention with exact transactional accounting that preserves admission.
- Replace small global reservation counts with resource admission; measure
  transfer/execution reservations and queued deadlines under representative load.
- Activate the prepared TURN/push changes with effective inherited limits and
  rollback; coordinate call admission, relay ports, web dispatch queues and
  representative resource validation.
- Validate feed query growth, recurring polling, SSE recovery, database pools,
  event-loop latency, WAL/checkpoints and overload recovery.

Those changes are not reported as complete by the HTTP block. In particular,
raising HTTP concurrency does not itself increase database or media capacity.
