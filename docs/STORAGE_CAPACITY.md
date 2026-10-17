# Physical storage admission preparation

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

The replacement physical policy/global allocator remains unselected. Existing
callers pass numeric logical capacities to `assertContentCapacity` after their
SQL changes, while triggers maintain the singleton during those changes.
Therefore an atomic replacement must establish transaction capacity before the
first charged write, not merely exchange the final comparison for a free-space
read. Existing source synchronization does not authorize schema activation.

Local regressions cover populated migration-073 history and source fingerprints,
all six lifecycles, charge/UUID-partition changes, bounded aggregate reads while
source tables are locked, 1600 additional reservations without new counter rows,
concurrent commits, rollback, missing partitions and unsafe totals. Existing
assembled upload/cleanup integration must still pass. These checks establish
counter behavior and query independence, not physical-volume or load acceptance.

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
