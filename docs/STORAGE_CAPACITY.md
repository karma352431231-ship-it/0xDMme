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

Block 15 above selects physical admission while retaining the existing guard;
the replacement global allocator remains unselected. Callers assert their
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
