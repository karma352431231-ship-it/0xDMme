# Exact quota accounting

## Prepared attachment accounting — 16 October 2026

Migration `073-attachment-quota-accounting.sql` replaces the last online personal
history sum with `attachment_quota_usage`, one indexed total per account.
`attachment_quota_messages` holds only positive charged totals per message and
participant. These derived rows let both attachment changes and personal-removal
changes reconcile the same desired state, including a statement that changes
both sources. They contain identifiers and byte counts, never media or plaintext.
The existing attachment charge counts for each participant until that participant
has a `kind='message'` removal; all attachment statuses retain the same rule.
Retained-byte subtraction remains in the separate direct account counter.

Statement triggers identify changed message/participant pairs from transition
rows, acquire the existing global ledger, then read the current sources in a
fresh `READ COMMITTED` snapshot. Reconcile only those pairs, aggregate net account
deltas in UUID order and skip unchanged rows. A removal lookup uses its primary
key; attachment lookups use the existing message index, rather than scanning an
account's history. Keep the global guard ahead of these derived rows. Replacing
that guard requires equivalent cross-table serialization in the pending global
capacity design. Mutations of these keys at other transaction isolation levels
fail closed instead of relying on a stale cross-table snapshot. The application
already uses `READ COMMITTED`; reads and unrelated/no-op changes stay unaffected.
PostgreSQL documents [fresh snapshots for volatile procedural functions](https://www.postgresql.org/docs/16/xfunc-volatility.html).

Backfill the totals and positive message rows under write-conflicting locks on
accounts, attachments and personal removals in the migration transaction.
`attachment_quota_totals` retains the historical formula for read-only
reconciliation, separately from online admission. Existing records, charge
amounts, direct/group counters, global usage and earlier checksums stay intact.
Fresh accounts initialize a zero total; account cascades remove derived rows.
Missing totals fail closed on reads and nonzero accounting changes.

**Ponto importante:** this completes the prepared incremental personal quota
formula, but does not remove singleton global contention or establish throughput.
Measure backfill, transition tables, one derived row per charged message/participant
pair and account contention under representative history before activation.
Schema activation remains separate. With our writers stopped, a reviewed rollback
removes only migration 073's triggers, functions, view, derived tables and exact
catalog entry before restoring compatible source; authoritative records and
earlier counters remain. Roll back later dependent migrations first.

Regression coverage includes a populated migration-072 predecessor, unchanged
direct counters/global usage/checksums, source and owner moves, every attachment
status, bilateral personal cleanup, combined writable statements, ledger-wait
interleavings in both directions, quota refusal, rollback, missing totals and
account cascades. Holding history tables blocks the exact predecessor getter
while the new counter getter returns the same bytes. Existing assembled private
message/attachment, vault, account and device integration remains required.

## Prepared personal accounting — 16 October 2026

Migration `071-personal-quota-accounting.sql` maintains the directly owned
portions of personal usage in `account_quota_usage` and `profile_quota_usage`.
Keep profile-owned charges keyed by profile; the existing unique account/profile
mapping joins them at read time. No historical rewrite is needed for that join.
The approved 1 GB personal quota and all existing charge amounts stay unchanged.

The sources are the encrypted account profile; vault operations; organizations,
credentials and domains; daily, read, conversation, presence, push and call
controls; personal-removal metadata net of retained bytes; recovery keys;
private message sender/recipient charges; private Matrix state; group controls
and reads; status data; and social directory, recovery, Matrix, secrets, message
and media charges. Update both participants' counters in UUID order when a
statement changes their charges. Initialize zero counters for new accounts and
public profiles, preserve cascades and fail closed for missing accounting.

**Ponto importante:** block 12 left the private-attachment sum and personal-removal
exclusion in the online formula. Migration 073 above subsequently prepares their
incremental replacement. Neither block replaces the singleton global byte counter.

The `account_quota_totals` and `profile_quota_totals` views are backfill and
reconciliation references, not admission paths. Install the counters and
statement triggers in a single migration transaction under write-conflicting
locks on their sources. PostgreSQL transition rows can spill to temporary
storage; measure realistic statement sizes, backfill duration and memory/I/O
before activation. Existing authorization/account/global coordination remains.

Migration `072-quota-lock-order.sql` keeps the global ledger ahead of both
personal and group counters, including changes to personal ownership charges
or accepted-media occupancy that leave global bytes unchanged. Only nonzero
deltas acquire that lock. This closes the inverse order with global-triggered
writes while preserving published migration checksums. Removing this gate is
part of the pending global-capacity redesign.

Local migration regressions populate every direct charge source and compare
the complete personal formula with its pre-counter SQL oracle after mutations,
deletions, cascades, owner mapping, concurrent updates and rollback. Retained-byte
and attachment-exclusion rules, quota refusal and missing counters are explicit
contracts. Source tests do not establish sustainable load capacity.
Lock-order regressions fail before migration 072 and verify that its global
guard precedes the derived counter lock without requiring a real deadlock.

Activation requires the same separate schema/preservation review as group
accounting. Roll back in reverse migration order, removing only this block's
derived triggers/functions/views/tables and matching catalog entry with our
writers stopped, before restoring compatible earlier source. Keep authoritative
records and the global content ledger. No migration is activated by a push.

## Prepared group accounting — 16 October 2026

Migration `070-group-quota-accounting.sql` maintains exact derived totals for
each group. Online quota checks read one indexed counter row rather than
repeating historical sums. The approved 2 GB group quota, its 75% media / 25%
text split and administrative margin stay unchanged. Personal attachment
accounting and the singleton global content counter remain separate pending work.

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
