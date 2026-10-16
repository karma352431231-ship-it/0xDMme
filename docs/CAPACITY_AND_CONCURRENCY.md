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

## Remaining audit work

- Size global content admission from the own data volume and operational space;
  remove the stale 900 MB environment budget without weakening individual
  quotas or admitting writes that endanger accepted data.
- Replace the global contact-admission lock with scoped coordination and
  concurrency regressions for revocation, consent, deletion and delivery.
- Replace repeated historical quota sums and the singleton byte-counter
  contention with exact transactional accounting that preserves admission.
- Replace single-job media preparation, the remaining four-operation gates in
  private/group/status transfer services and small global reservation counts
  with fair recoverable resource-based queues.
- Remove/recalibrate TURN and push service quotas; coordinate call admission,
  relay ports, bandwidth, descriptors and sender concurrency.
- Validate feed query growth, recurring polling, SSE recovery, database pools,
  event-loop latency, WAL/checkpoints and overload recovery.

Those changes are not reported as complete by the HTTP block. In particular,
raising HTTP concurrency does not itself increase database or media capacity.
