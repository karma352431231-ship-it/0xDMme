# Exact quota accounting

## Prepared group accounting — 16 October 2026

Migration `070-group-quota-accounting.sql` maintains exact derived totals for
each group. Online quota checks read one indexed counter row rather than
repeating historical sums. The approved 2 GB group quota, its 75% media / 25%
text split and administrative margin stay unchanged. Personal accounting and
the singleton global content counter remain separate pending work.

`group_quota_usage` stores text/control bytes, all reserved or retained media
bytes, and accepted media bytes used by retention scheduling. Its sources are
groups, events, members, consents, key sets, packets, message changes, Matrix
envelopes, media, cleanup jobs and invitation links. Existing charge columns
remain authoritative. Deleting physical media releases its reserved/retained
bytes; changing accepted media to deleting only reduces accepted occupancy.

Statement triggers aggregate old/new transition tables by group in UUID order.
They project identifiers, charge fields and media status without serializing
ciphertext. Counter changes commit or roll back with the source statement.
Unchanged net amounts do not write the counter. Existing account/group locks
and global accounting triggers remain in force; removing that global
coordination requires a separate lock-order and atomic-admission design.

PostgreSQL still captures affected rows in transition tables, which can use
temporary memory/disk for large statements. Measure that overhead with realistic
packet sizes and the existing bounded write batches before activation.

Missing accounting for an existing group fails closed. Deleting a group removes
its derived row, including during cascades. Groups still absent from the
database retain the previous zero-usage read behavior; authorization continues
to belong to the calling group operation.

## Backfill, reconciliation and activation

The migration takes write-conflicting locks on all group charge sources before
backfill and trigger installation in the migration transaction. This prevents
changes between the counted snapshot and incremental maintenance. It does not
change existing content, charge columns, global totals or earlier migration
checksums. It adds one operational counter row per group and no dependency.

`group_quota_totals` is the historical reference view used for backfill and
read-only reconciliation. It is not an online admission path. Operational
reconciliation should select a bounded page of group IDs and compare their
counter fields under one consistent read snapshot. Report discrepancies;
do not silently repair counters while accepting concurrent writes. Scheduling,
large-history query plans and backfill duration still need acceptance work.

**Ponto importante:** this schema transition is prepared locally and needs its
own review before the final integrated activation. Stop/drain our own writers
for the reviewed migration window, measure backfill/lock duration, verify
preservation and reconcile before enabling the new source. Code push does not
apply this migration. Use the existing deployment executor after that review.

A rollback review must include both source and schema/catalog compatibility:
older workers reject an unexpected migration catalog. With our writers stopped,
remove only the derived group triggers/view/function/table and this migration's
catalog entry, checking its exact checksum, before restoring earlier source.
Preserve all authoritative group records and the existing global ledger.
Do not execute a partial schema rollback while new source or workers are active.

## Validation contract

Use a populated predecessor schema and verify every charged source, unchanged
global usage and historical migration records. Cover media state transitions,
quota refusal and rollback, concurrent changes, moved ownership, no-op updates,
missing counters, cascades and reads while history tables are locked. Run the
existing assembled group delivery/governance/media/cleanup integration. Those
checks establish accounting behavior; representative load is still needed to
quantify throughput and latency.
