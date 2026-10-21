# Categorized change signals and shared message work

## Owner decision — 21 October 2026

The owner approved categorized change hints and removal of unnecessary repeated
queries after reviewing two complete private-message delivery captures. New
responsibilities must have cohesive modules; app entry points and existing chat
hotspots receive wiring only. This document is the active English decision
record for this change, alongside [message receiving](MESSAGE_RECEIVING.md).
Historical implementation plans remain preserved outside this integration's
current English documentation set.

The approved direction separates private messages, handle messages, groups,
receipts, contacts/permissions, status, public activity and vault changes. Frames
remain empty: categories add only the class of activity, never message text,
wallets, account/device IDs, conversation IDs or message IDs. No third party,
telemetry, schema, dependency or cryptographic-format change is authorized.

## Signal contract

- A closed category vocabulary belongs to a small shared protocol module.
  Domain owners register their own affected accounts and categories within the
  existing transaction. A bounded transaction collector publishes only after
  COMMIT; rollback emits nothing. Categories preserve their per-account scope.
- The signed live request negotiates `{ categories: true }`. Legacy clients
  requesting `{}` continue receiving generic `changed` frames. A new client can
  use the legacy request against a server that has not yet added negotiation.
- Ordinary hints coalesce within the existing bounded window and output budget.
  Unknown/unclassified changes retain general `changed` recovery. Exclusion and
  authorization controls remain immediate; session end/revocation retain their
  current lifetime and closure behavior.
- Cross-process notifications and cross-tab delivery preserve category and
  compatibility boundaries. An old parser must not silently miss a new hint or
  repeatedly disconnect from a newly categorized stream.
- A hint schedules current authenticated reads. It never grants access, proves
  completeness, acknowledges delivery/read, or replaces snapshot confirmation.
  Initial connection, reconnect, suspension and legacy fallback preserve full
  reconciliation.

## Receiving and presentation

Private account receipt, the conversation list and the selected history retain
their distinct lifetimes and presentation responsibilities. Their verified
message work is coordinated: a visible selected update runs before counters,
preview refreshes and unrelated maintenance. Completed verified history can
publish its contact preview without another packet read. The list and account
inbox continue working when no conversation is selected.

Coalescing retains bounded pending work and yields between safe operations; it
does not overlap SDK/store ownership or abandon accepted messages. Pending or
failed work cannot publish stale content after removal, authorization loss,
session replacement or suspension. Receiving/previewing does not mark messages
read; existing visible-history rules remain responsible for read acknowledgement.

## Sending

Recipient history may be reused only inside the bounded send operation whose
identities were checked and pinned, and only while its corresponding current
authority remains the same. An authority change requires renewed validation and
pin persistence before key distribution. This is not an authority cache shared
between independent operations. Existing encryption, recovery, idempotency,
quota, revocation and delivery checks remain mandatory.

SDK session-lifetime changes are separate from this repair unless their safety
and need are demonstrated by focused tests. Repeated work must not be removed by
skipping identity or membership verification.

## Validation and acceptance

Regression checks must cover category routing, legacy and mixed-version
behavior, rollback, immediate closing signals, reconnection, bounded coalescing,
visible receipt before decoration, background receipt without selection,
snapshot conflicts, removals, session changes and sender identity changes.
Request-count reductions are distinct from measured user-visible latency.
Operational captures stay in ignored `.local/`; code publication and activation
remain separate from implementation and local verification.

**Ponto importante:** the owner approved restructuring and eliminating redundant
work while preserving the existing security and privacy boundaries. Local tests
do not establish physical-device or VPS delivery latency; repeat the paired
capture after any separately authorized activation.
