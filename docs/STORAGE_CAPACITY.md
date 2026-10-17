# Physical storage admission preparation

## Physical volume admission — source block 15

Staging web and all three worker roles now use an adaptive capacity contract.
The retired `HASH_TALK_ACCOUNT_CAPACITY_BYTES` value no longer controls staging
admission. Local development/browser fixtures retain explicit numeric budgets.
No account quota, charge formula, retention policy or authorization changes.
New account creation also checks physical availability before issuing its session;
existing-account login keeps its existing bounded session lifecycle.

The runtime factory validates `/opt/0xdmme/release`, the existing own-volume
read-only bind visible inside every service's private mount namespace. Require
its canonical directory to be on a different device from its private parent,
pin that device and check it before/after every filesystem sample. Existing
service dependencies require the dedicated data mount. A missing/replaced path,
ordinary directory, changed device, invalid sample or measurement failure fails
closed; never fall back to host/system free space. This needs a service-namespace
rehearsal before activation; local positive mount tests use synthetic filesystems.

Each admission requires a READ COMMITTED write transaction, keeps the existing
global ledger row lock, reads committed plus
its own pending-write partitions, and obtains fresh unprivileged filesystem
availability. Accepted reservations are checked before their acknowledgement and
filesystem upload. The guard makes independent web/worker claims atomic; it is
not removed by this packet. SQL source writes still precede the final assertion
in the existing transaction and can consume temporary physical space before
rolling back. The operating budget includes concurrent SQL room for that reason.

New growth requires available bytes to cover the full conservative pending-write
envelope plus this operating reserve, calculated from current PostgreSQL state:

- Two existing 128 MiB release workspaces, matching the deployment executor.
- Three current database sizes, including existing heap/index/TOAST allocation,
  matching its database/dump/file-backed SQL allowance and maintenance room.
- Two configured WAL checkpoint targets as growth cushion. PostgreSQL documents
  that [max_wal_size is a soft limit](https://www.postgresql.org/docs/16/runtime-config-wal.html#GUC-MAX-WAL-SIZE),
  so this is neither a WAL quota nor a guarantee against all WAL spikes.
- Autovacuum workers times the larger maintenance/autovacuum work-memory setting.
- 64 MiB per configured PostgreSQL connection for SQL already in progress,
  covering the current largest bounded cache publication and smaller API writes.
  A future larger write batch must review this bound. It is operating space,
  not a connection/user/admission-count limit.

Current filesystem availability already accounts for resident objects, physical
SQL, existing backups, temporary files and occupied WAL. Pending envelopes can
double-count partially materialized files until acceptance; this intentionally
preserves a conservative promise. These formulas require representative peak,
WAL, spill and query-overhead acceptance, rather than a claimed supported load.
No fixed global GB total or unexplained disk percentage replaces the retired cap.

Full object-copy backups remain separately measured and checked by the existing
deployment executor, which requires two object-copy sizes in addition to its
SQL/release allowance before a schema transition. Normal chat admission does
not reserve two copies of all future objects indefinitely or promise that a
future full-copy transition will fit. At high physical occupancy such a
transition can require additional own-volume space or a separately reviewed
backup strategy. No backup deletion/retention or executor change is included.

Migration 075 captures the first logical and pending-byte totals in
transaction-local settings, only for volume-mode connections. Baselines expire
on commit/rollback and preserve the source/global/derived data. They distinguish
new write promises from completion or cleanup that releases them. Scoped
personal cleanup, group deletion and retention jobs may use operating space for
their metadata, but cannot increase pending payload promises through that path.
The same normal source operation can still fail if actual hardware space cannot
preserve its SQL. Numeric local budgets keep their prior assertions.

The volume sampler owns at most one unfinished read per process. A one-second
measurement deadline fails admission; a late/unsettled read retains ownership
and blocks another sampler read rather than accumulating filesystem work.
Failures use the existing bilingual capacity reason without leaking paths.
Ranking preflight is advisory and includes future SQL growth; publication still
asserts capacity in its write transaction. No new dependency or shared service
change is needed.

**Ponto importante:** the old global GB ceiling is replaced in prepared staging
source, not on the VPS. Global ledger serialization and the separate allocator/
lock redesign remain pending. Migrations 070–075 and final activation require
schema/preservation/backfill/rollback review. Reverse migration 075 by removing
only its two baseline triggers/function and matching catalog entry with our
writers stopped, after later dependent migrations, before compatible rollback.

## Reservation accounting — source block 14

The global logical content budget currently counts every charged record and
reservation. It is not a measurement of free disk. A physical admission policy
also needs to know which accepted reservations may still produce filesystem
writes. Removing the stale environment budget without that distinction could
admit more promised payload than the own volume can preserve.

Migration `074-storage-reservation-accounting.sql` materializes the current
pending-write envelope separately from logical quotas. Each eligible reservation
contributes its existing full charge once, regardless of how many participants
are charged personally. This is an exact total of the specified envelope, a
conservative bound rather than a measurement of remaining unmaterialized bytes:
partial/ready files may already occupy disk, and charges include metadata.
Never subtract this total from logical used bytes as if it were physical use.

| Source                 | States with possible remaining writes | Envelope                      |
| ---------------------- | ------------------------------------- | ----------------------------- |
| Vault operations       | `reserved`, `writing`                 | Existing `charge`             |
| Private attachments    | `reserved`, `writing`, `ready`        | Existing `charge`             |
| Group media            | `reserved`, `writing`, `ready`        | Existing `charge`             |
| Status media           | `reserved`, `writing`, `ready`        | Existing `charge`             |
| Social DM media        | `reserved`, `writing`, `ready`        | Existing `charge`             |
| Public community media | `uploading`, `processing`             | Existing preparation `charge` |

Accepted/attached data and deleting/discarding records make no new write promise
in this envelope. Their existing files still consume physical space and their
logical charges are unchanged until the existing owner releases them. Returning
a record to a writing-capable state restores its envelope. Public preparation
charges already include two input copies, the output budget and existing
thumbnail/metadata allowance; this block does not change those amounts.

Counters use 256 UUID-prefix partitions per source. This is accounting
partitioning, not a visitor, upload or queue limit. The six sources always have
1536 rows; reads aggregate only those rows and never walk reservation history.
Statement transitions aggregate changed counts/charges per partition. Zero net
deltas do not rewrite counters. Nonzero deltas retain the existing global
ledger-before-derived-row order; this guard must change together with global
admission, not disappear from an isolated trigger. Missing/corrupt partitions
fail closed. The module exposes aggregates only; the existing private database
observation command includes them without IDs, source JSON, SQL text or content.

Backfill and trigger installation share the migration transaction under
write-conflicting locks on the six sources. Existing records, states, charges,
quota counters, global usage and prior migration checksums remain authoritative
and unchanged. Reference view `storage_reservation_totals` is for bounded
operational reconciliation under a consistent snapshot, not online admission.
The reference view scans source history; paging its output does not by itself
bound that historical work. Measure reconciliation plans separately.
The counter rows and transition tables add maintenance/memory/WAL overhead to
measure with representative data before activation.

**Ponto importante:** block 14 prepares a prerequisite. It does not remove the
900 MB effective environment ceiling or the singleton global ledger. It adds
coordination to pending-envelope changes without changing admission behavior;
final activation must review this together with the remaining global capacity
work. No supported volume/user count follows from these source tests.

## Remaining physical and global coordination contract

- Read current physical availability on the own data filesystem, not system
  disk free space or a one-time startup sample. Keep the existing outside-image
  system reserve separate from the own-volume operating margin.
- Account for existing physical data, still-promised writes, database/index/WAL
  growth, temporary preparation and deployment/backup work. Full-copy backup
  requirements in the existing deployment executor remain; this source packet
  neither changes backup retention nor reserves an unexplained percentage.
- Preserve atomic admission across web and workers. Concurrent independent
  snapshots or unchecked shard sums must never grant the same remaining bytes.
  An exact credit/escrow approach needs a reviewed allocation/rebalance protocol,
  failure/restart handling and conflict tests before replacing the global guard.
- Update all current global accounting triggers, explicit `lockContentUsage`
  calls, group/personal counter guards and attachment cross-table serialization
  together. The latter relies on a fresh READ COMMITTED snapshot after its
  guard. Align account/group/retention lock order with the chosen algorithm.
- Preserve individual quotas, authorization, retention, durability and accepted
  data. Pressure must refuse new work and permit safe cleanup/recovery. A large
  constant, `Infinity`, disabling maintenance or an approximate unprotected
  aggregate is not a completion of this contract.

Block 15 above selects physical admission while retaining the existing guard.
Block 17 below selects/prepares the short-coordinator credit primitive; runtime
adoption and the replacement source/owner coordination remain pending. Callers assert their
numeric fixture budget or adaptive physical policy after SQL changes, while
triggers maintain the singleton during those changes.
Therefore an atomic replacement must establish transaction capacity before the
first charged write, not merely exchange the final comparison for a free-space
read. Existing source synchronization does not authorize schema activation.

Local regressions cover populated migration-073 history and source fingerprints,
all six lifecycles, charge/UUID-partition changes, bounded aggregate reads while
source tables are locked, 1600 additional reservations without new counter rows,
concurrent commits, rollback, missing partitions and unsafe totals. Existing
assembled upload/cleanup integration must still pass. These checks establish
counter behavior and query independence, not physical-volume or load acceptance.

## Global statement accounting — block 16

Migration 076 consolidates the former global row triggers on 80 source tables.
For each supported insert/delete/update event, aggregate only the corresponding
transition rows and apply their exact net charge once. The account-profile rule
remains `coalesce(octet_length(profile_ciphertext)+524,0)`; other sources keep
their existing `charge`. Preserve the predecessor event set, including tables
whose charges are only tracked on insertion/deletion. PostgreSQL transition
tables cannot use column-specific UPDATE triggers, so existing update-enabled
sources now collect all updated rows and discard unchanged net charges. See
[PostgreSQL trigger behavior](https://www.postgresql.org/docs/16/sql-createtrigger.html).

Statement trigger names precede quota and reservation statement triggers. A
nonzero delta still holds the global ledger row through commit/rollback, and
migration 075 still captures the first transaction baseline before its update.
Generation cache changes now follow the same global batch and lock order;
ranking entries retain their existing global-before-cache batches. Missing
global/cache accounting refuses the mutation. Retired row functions are removed.

The migration validates the predecessor catalog and locks those source tables
against writes before replacing triggers. It does not scan/backfill source data,
rewrite any charge/counter, alter old checksums or change quota/retention rules.
Existing numeric and physical capacity checks remain authoritative. Reconciliation
and predecessor fingerprints must agree before and after the schema transition.

The regression reproduces 1,000 ledger writes on the predecessor for a 1,000-row
journal insertion. Prepared accounting uses one write for each tested 1,000-row
insert/update/delete batch with identical charged totals. Separate upsert events,
foreign-key cascade commands and different relations can still emit additional
batches. Zero global deltas do not write/lock this counter, but independent quota
or reservation guards may still acquire it. This is a reduction in repeated SQL
and WAL work, not removal of global transaction serialization or a throughput
claim. The atomic global allocator remains a separate pending contract.

**Ponto importante:** transition relations consume memory and can spill to disk;
wide ciphertext/JSON updates now also use the transition-enabled UPDATE path.
Existing operation bounds remain. Measure temporary I/O, peak memory, lock waits
and WAL under representative history/batch sizes before activation; do not raise
batch sizes or disable durability to compensate. This block has no VPS changes.

Rollback requires drained own writers and later dependent schemas reversed first.
Within one reviewed transaction, remove the new statement triggers/function,
restore only the former global function/trigger definitions from migrations
008/012/013 and their later trigger declarations, plus the generation-cache
function/trigger from 047, and remove catalog entry 076. Do not rerun old schema
migrations wholesale or reset/backfill counters. Preserve all source rows, ledger
values, owner/pending counters and transaction-baseline triggers. Reconcile before
resuming code compatible with the restored catalog.

## Transaction-owned allocations — block 17

Migration 077 adds an empty allocation ledger and its own coordination row.
It does not change source triggers, old global accounting, individual quotas,
retention or runtime admission. The prepared `ContentAllocator` is exported for
coordinated adoption; no current store calls it and no extra runtime connection
pool is created. This block cannot by itself eliminate singleton contention.

The selected primitive works as follows:

1. The owner begins a writable READ COMMITTED transaction in volume mode. Its
   top-level `xid8` identifies this concrete operation. Autocommit, incompatible
   isolation/mode, another installation or a completed owner cannot obtain a
   credit. No account/group maximum or hypothetical future data is reserved.
2. A separate coordinator transaction acquires the allocation guard, collects at
   most 128 completed owners, then measures fresh headroom. The physical adapter
   subtracts current pending envelopes and its existing operating reserve from
   current own-volume availability. It does not read an unprotected shard sum.
3. Under that same guard, subtract all durable outstanding credits and grant the
   declared positive byte envelope only if enough room remains. Commit before
   returning the immutable grant. The owner must await it before charged writes.
   Same-owner/same-size retries are idempotent; resizing is refused. The amount
   must cover the actual payload and SQL envelope, not a full personal quota.
4. Release the coordinator guard at its commit, retaining the credit while the
   owner works. A live owner cannot refund it, including after savepoint rollback.
   Existing transaction deadlines still bound the future caller's lifecycle.
5. After owner COMMIT/ROLLBACK, the finalizer removes the credit idempotently.
   Coordinator replacement or lost finalization leaves a durable credit for
   bounded opportunistic recovery. No wall-clock expiry can free a live promise.

Recovery uses `pg_visible_in_snapshot(xid8,pg_current_snapshot())` in the
coordinator's READ COMMITTED transaction. The top-level owner must be completed
in that snapshot before its credit is deleted. Its committed pending promises
are therefore visible to the subsequent fresh headroom query, or its still-live
credit remains conservatively charged. Using an early commit-status bit alone
would not establish that ordering. PostgreSQL documents the
[snapshot and transaction visibility contracts](https://www.postgresql.org/docs/16/functions-info.html#FUNCTIONS-PG-SNAPSHOT).
Remaining completed credits beyond the 128-row batch also stay charged safely;
the batch size bounds deletion work and is not a user/concurrency ceiling.

The caller owns a separate pool with explicit positive capacity and connection,
query, statement, lock and idle-transaction deadlines. Do not borrow the owner's
occupied connection or grow the established combined connection budget. The
production physical reader already owns its one-second bounded sample lifecycle;
other injected headroom providers must also be bounded and must not acquire
owner/global write locks. Failed coordinator work rolls back and discards its
connection when its outcome is ambiguous; a normal refusal with confirmed rollback
can reuse the healthy connection. If COMMIT acknowledgement is lost, any persisted grant stays charged
until recovery proves owner completion; do not assume failure released space.
Rollback failure preserves both errors rather than claiming successful cleanup.
Raw internal errors are not a new public API response.

Verification covers populated predecessor hashes/catalog/quotas, competing
coordinators, coexisting granted owners, retry/resize refusal, fresh committed
pending promises, rollback/savepoints, coordinator replacement, owner disconnect,
bounded recovery, measurement/lock/COMMIT failures and ordinary application-role
permissions. A local protocol proxy drops the acknowledgement only after the real
server emits successful COMMIT; the persisted credit remains charged until owner
completion. A refused deferred COMMIT is tested separately.
No supported throughput or user count follows from these source checks.

**Ponto importante:** connecting the allocator requires enforceable per-operation
SQL/payload envelopes before the first charged write; transaction-owned partition
accounting; updated physical baselines; and scoped owner, attachment cross-table
and pending-reservation guards with an explicit lock order. No unchecked use of
this primitive authorizes removing the old global guard. Full runtime integration,
backfill/reconciliation, pool sizing, crash/restart and representative load remain
open. Source push does not activate migration 077 or any VPS configuration.

For reviewed rollback, drain own writers and reverse later dependent protocols
first. Prove every allocation owner finished and the ledger is empty, then remove
only these two tables and catalog entry 077 in one transaction. Keep all source
data, existing counters, old schema checksums and payload files unchanged. Restore
code compatible with the retained catalog; do not expire live credits to roll back.

## Vault allocator adoption — block 18

The owner approved local preparation after explicit review of the central schema,
guard and pool changes. Migration 078 and runtime adoption remain unactivated.
Only `VaultStore.reserve` on volume-mode web connections adopts durable credits.
Authorization, account locking, head validation and idempotent retry precede the
grant. Personal quota checks and the existing error contract remain unchanged.
Other vault mutations and other stores still follow legacy coordination.

The web's existing sixteen query connections become fifteen owner connections
and one lazy coordinator connection; worker pools stay at four. The coordinator
does not borrow the owner pool, avoiding exhaustion by owners waiting for grants.
It holds its guard only during a bounded grant/recovery transaction. Owner SQL
retains its durable credit until COMMIT/ROLLBACK is proven by a fresh snapshot.
Uncertain finalization retains credits and fails service health; it does not
misreport an already acknowledged commit as lost. Restart collection is bounded,
with no expiry of live promises. No dependency or PostgreSQL setting changes.

Migration 078 renames the original ledger to `content_usage_legacy` and preserves
`content_usage` as an exact aggregate compatibility view. Original source rows,
charge formulas, quotas, events and migration checksums are unchanged. The legacy
contribution plus signed partition deltas equals the logical total. Deleting a
credit-origin record through the legacy path can make that component negative;
its aggregate remains exact. Components retain safe-integer bounds and public
admission refuses missing, negative or unsafe aggregate totals. Review runtime
grants on the renamed base, new view, sequence and allocator tables at activation.

An adopted transaction claims an unlocked ledger slot and keeps it through its
transaction. Initially there is one slot per configured database connection; if
all are busy, another slot is inserted transactionally. There is no fixed writer
count refusal or per-operation history table. Slot count follows peak concurrent
writers. Bounded recovery also folds up to 128 idle nonzero slots into the legacy
component, skipping busy legacy/partition rows without waiting. The exact total
is unchanged and ordinary traffic does not accumulate indefinitely in signed
components. Legacy SQL delta updates/deletion through the old name remain supported.
Statement accounting and the four quota/reservation functions change only their
shared gate. The adopted source can avoid it because it is restricted to one
account/operation; cross-table attachment and group mutations remain legacy.

Before any adopted source row is inserted, a trigger verifies the current xid,
volume mode, READ COMMITTED isolation, durable `vault-reserve` scope, account,
operation, reserved state and unused grant. All eighty charged sources and ranking
entries reject unsupported writes under that binding. The grant includes the
pending object charge, four times the serialized commit size and 16 KiB SQL room.
The source requires its actual charge plus four times `pg_column_size(NEW)` and
4 KiB before heap insertion; an insufficient envelope rolls back without effects.
The operating reserve remains necessary for physical SQL/index/WAL behavior.
These are conservative admission envelopes, not guarantees against hardware loss.

Legacy final physical admission takes the allocator guard through COMMIT and
subtracts outstanding credits. A grant either precedes that assertion and is
counted, or follows its visible commit and sees its pending promises. A validated
adopted write has already consumed its pre-write envelope and avoids measuring or
charging it twice. Cleanup classification uses signed transaction-local logical
and pending deltas, rather than changes in global totals that independent writers
can now affect. First baselines remain observable for compatibility. All local
settings and consumed credits follow savepoint/transaction rollback.

Activation needs preservation and load rehearsal plus an explicit schema review.
For reversal, stop only our writers and coordinators; prove no live credits and
retain a verified backup. Under source-table maintenance locks, capture the exact
aggregate, restore the four predecessor quota functions and statement/baseline
functions, remove adopted-source triggers, fold partition deltas into the original
base, replace the view with the original table name/check and restore its baseline
trigger. Remove only the new partition/functions/scope and matching catalog entry.
Preserve all source rows, quotas, pending envelopes and post-activation writes;
never roll back by restoring stale data. Rehearse this sequence on synthetic
populated data before activation. Later migrations require their own dependency
review before reversal. Operational access/evidence stays in `.local/`.

**Ponto importante:** this first adopted flow can avoid the old global row lock.
It does not finish P-DB, convert all writers or establish a throughput/user count.
Representative physical envelope, slot growth, WAL and mixed-load acceptance,
remaining coordination and the final reviewed activation are still pending.

Local validation includes populated predecessor fingerprints/catalog and exact
totals, competing legacy/credited claims in both orderings, source scope/envelope
refusal, independent slots, savepoints, idle-slot consolidation, ordinary-role
permissions, a post-commit finalization fault and transactional maintenance
reversal. The assembled vault suite runs through the volume-mode web path with
real cryptographic commits, HTTP, quotas, revocation and recovery. This is protocol
and preservation evidence; it does not replace physical-volume/load acceptance.

## Complete vault lifecycle adoption — block 19

The owner explicitly approved local migration 079 preparation after reviewing
its source guards, counter reconciliation and reversal risk. Only volume-mode
web vault operations adopt its maintenance scope; no VPS activation is included.

Vault completion and final discard now bind a transaction-owned maintenance
envelope before their source effects. The allowance is the existing 64 MiB per
database connection reserved for in-flight SQL in the physical policy. One live
top-level owner occupies one backend connection and gets at most one grant; its
bounded SQL fits that pre-existing operating allowance. Maintenance credits are
not new payload promises and are excluded from growth-credit subtraction. They
still retain transaction ownership, bounded collection, snapshot-based release
and uncertain-outcome recovery. Real hardware exhaustion can still fail SQL;
durability, maintenance and physical-volume validation remain required.

The maintenance envelope is eight serialized commit sizes plus 32 KiB. BEFORE
source guards verify account, operation, writer and one supported mutation:
writing-to-accepted with unchanged ciphertext/charge/identity, or deletion of an
already discarding operation. Actual old/new row costs are charged before effects.
New payloads, other sources, immutable-field changes and excess budgets fail
atomically. A checkpoint guard charges the matching head INSERT/UPDATE, including
the two BEFORE events possible for UPSERT. Before COMMIT, verify the accepted
operation matches its durable checkpoint or the discarded row is actually gone;
then assert the exact logical aggregate. Preserve account/operation lock order,
authorization, idempotent discard and stale-writer refusal. No transaction spans
object upload or deletion. A failed post-commit finalization retains its token
and fails service health without misreporting the accepted checkpoint as lost.

An operation in `discarding` can return to `reserved` if physical removal fails.
Its prior physical promise must therefore remain charged until removal succeeds
and the source row is deleted. Migration 079 adds that state to the vault pending
reference/triggers and reconciles only its 256 derived partitions. It does not
change logical charges, individual quotas, encrypted rows, old checksums or the
other five reservation sources. Completion releases its promise after acceptance;
discard restoration and startup reset do not create an unadmitted promise.

Startup recovery no longer stops after eight 32-row batches. With the previous
single writer stopped, process ordered 32-row batches until no interrupted
writing/discarding rows remain. A matching partial index avoids scanning accepted
history repeatedly. Accepted versions, timestamps, retention and quota charges
are preserved. Normal expiry admission remains bounded and is not a background
throughput or representative-load claim.

Reverse 079 before 078 under maintenance with our writers/coordinators stopped,
no live credits, a verified backup and source/counter fingerprints. Restore the
078 allocation/source functions and predecessor pending view/triggers, reconcile
the vault partitions to those predecessor states, remove only the new checkpoint
guard/functions/recovery index and maintenance constraints/scope, and remove the
matching catalog entry. Source rows, accepted checkpoints and subsequent writes
must survive. The synthetic rehearsal also reverses 079 before the existing 078
rehearsal. Live schema timing, preservation, backup/restore and resource acceptance
remain separately reviewed; no stale-data restore is an acceptable rollback.

**Ponto importante:** this packet closes legacy-lock dependence for the prepared
vault lifecycle, including confirmation, discard and interrupted recovery. Other
database writer families, general/group/retention coordination, representative
load acceptance and final activation remain pending. The existing central database
hotspot still has its separate migration-runner then connection/health split plan;
this packet only registers its migration and exports the existing SQL allowance.

Local validation covers populated predecessor preservation and exact pending
reconciliation, independent completion/discard/expiry/recovery under the old
ledger lock, ordinary-role execution, source/envelope/checkpoint refusal,
savepoints, missing-ledger rollback, retained post-commit tokens and recovery of
more than 256 interrupted records. The full cryptographic vault/HTTP and related
quota/accounting suites also pass. Synthetic pressure and SQL maintenance reversal
establish protocol behavior; they do not establish real-volume/load acceptance.

## Private-message admission — block 20

Migration 080 adds the `message-admit` scope for volume-mode web admission.
Text, profile, related actions and attachment packets retain the same signed
protocol, checks, charges and both personal quotas. Consent admission remains
shared; lock both participant accounts in UUID order before authority/consent
checks and payload effects. General consent/device mutations retain their
exclusive gate. Unrelated pairs can proceed independently; the same participants
still coordinate quota, checkpoints, relations and current device authority.

The common transaction/connection lifecycle now lives in `content-write-allocations`.
Vault and private-message adapters declare their own envelopes and pre-COMMIT
contracts through that component. Reuse the existing single coordinator and
15 writer connections within the web budget of 16; workers remain at four.
Contact transactions own borrowed-connection errors and discard uncertain COMMIT
connections through the existing allocation transaction runner. Publish change
hints only after successful COMMIT. Finalization failure keeps the durable token
and fails health without reporting an acknowledged message as lost.

Before the first charged mutation, grant nine serialized packet sizes, 8 KiB per
device reference, 64 KiB for new checkpoints/journals and the actual row-size-based
allowance for ready attachment updates, journal rows eligible for pruning and
recipient push hints. Never scan message history to estimate this grant. Payloads
of ready attachments are already reserved; accepting them releases only their
pending promise, preserving logical charge and attachment/removal reconciliation.
A concurrent change that exceeds the allowance fails atomically before its
source effect. These conservative envelopes need physical/WAL/load measurement;
they do not promise hardware-independent availability.

BEFORE guards restrict every charged source plus uncharged message heads and
references. Allow one bound packet INSERT; immutable ready-to-accepted attachment
updates for its declared IDs; references for current participant devices; one
head advance and matching single-ID journal per participant; pruning only older
than the existing 256-revision window; and recipient push-state updates with
unchanged subscription/charge. Charge actual old/new row SQL costs plus new
logical charges against the durable grant. Deny other sources, participants,
payload mutations, repeated checkpoints and excess envelopes. Transaction-local
bindings/effects roll back with savepoints. Other scopes cannot use the new
metadata guards to mutate private-message state.

Before COMMIT, require the admitted packet, both exact head/journal advances,
all declared attachment acceptances and exactly the expected current device
references, excluding participants who removed the original of a related action.
Keep application authorization, recovery/directory checks, relation/action rules,
both final quota assertions and exact global accounting. Attachment quota
reconciliation itself is unchanged: ready-to-accepted preserves its per-owner
charge, while the existing pending trigger removes its physical promise.
Unconverted attachment creation/removal and other writer families retain their
legacy coordination; this is not a claim that P-DB is complete.

080 creates guards/functions and widens the allocation scope; it rewrites no
source rows, derived counters or old migration checksums. Under maintenance,
stop our writers/coordinator, prove no live credits and hold the affected source
locks. Restore the captured 079 allocation/source functions, remove only the new
metadata triggers/message guard functions/scope and exact 080 catalog entry.
Preserve post-upgrade packets, references, checkpoints, notifications, charges
and pending promises. Reverse 080 before 079/078; test a populated reversal and
back up/verify live preservation before final schema activation. Do not restore
stale source data as rollback. Operational evidence remains outside Git.

**Ponto importante:** this source packet removes the old ledger wait from complete
private-message admission. Reads, receipts, removals, attachments outside admission,
general/group/retention writers, integration/load acceptance and VPS activation
remain pending. The central database hotspot receives composition/registration
only; its migration runner and then connection/health split remain a separate
reviewed task with concurrent migration/checksum, startup/health and worker tests.

## Activation and rollback review

Re-read the live catalog/configuration before the final activation. Drain our
writers, measure backfill and reconcile all partitions while preserving old
checksums/global/owner totals. Use the existing deployment executor after the
schema/preservation review. No VPS operation is performed by this source block.

With our writers stopped and later dependent migrations reversed first, a
reviewed rollback removes only this migration's six sets of derived triggers,
function, reference view, counter table and exact catalog entry. Restore source
compatible with that catalog. Preserve all source records, their payload files,
individual counters and the global ledger. Do not roll schema back under active
new workers.
