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
  repeatedly disconnect from a newly categorized stream. Ephemeral cross-tab
  coordination uses a new protocol scope: old tabs retain their legacy stream
  until updated, while updated tabs share one categorized stream. This can
  temporarily keep one stream per protocol version during mixed-version use.
- A hint schedules current authenticated reads. It never grants access, proves
  completeness, acknowledges delivery/read, or replaces snapshot confirmation.
  Initial connection, reconnect, suspension and legacy fallback preserve full
  reconciliation.

## Receiving and presentation

Private account receipt, the conversation list and the selected history retain
their distinct lifetimes and presentation responsibilities. The account
receiver is the single owner of ordinary private content: a private hint
demands one prompt receiver turn whichever chat is open, without the client
coalescing window or the speculative preparation delay. The open chat, retained
inactive windows and their previews are updated from that same verified commit;
the selected conversation no longer runs a second reader for new messages.

A journal cut from F to T covers a retained window read at W by another
verified reader when F <= W <= T and the fences of W and T are equal. Removals
advance the invalidation fence, so equal fences prove no removal separates
them. A window ahead of the cut keeps its rows untouched, so older rows cannot
resurrect a later removal. The selected history read remains for opening,
removal or authority changes, and a window a completed cut passed without
covering it.

Live receipt waits only for an active foreground owner or a requested opening.
The text send quiet period, startup decoration and queued checks do not delay
it, and decorative maintenance yields to runnable live receipt. A foreground
action waits for an in-flight live page to commit instead of discarding it;
speculative preparation is still interrupted. Sending and receiving therefore
alternate during continuous typing. A live receipt failure offers the retry
action, as the selected read it replaced did. The list and account inbox
continue working when no conversation is selected.

Authorized unread counts and mute rules still decide sound before visible
history is acknowledged as read. Acknowledgement follows that projection without
waiting for presence or push preferences; its receipt hint reconciles the changed
counts. This preserves incoming sound while removing the extra per-peer state
query previously attached to every visible read confirmation.

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

The implementation keeps event vocabulary in `shared/live-changes`, transactional
registration in `server/database/transaction-changes`, client admission/routing
in `messages/live-updates` and `messages/preview-admission`, and scoped followup
in `messages/change-followup`. Send-batch proof has its own `messages/send-batch`
module. These modules expose narrow contracts rather than importing other
features' internals. App entry points only connect the existing owners.

The existing message screen and controller remain hotspots. A separate reviewed
extraction should isolate packet verification/storage first, then selected
conversation rendering/navigation. Preserve cancellation, SDK ownership,
recovery, removal, receipt and snapshot regression coverage during those cuts;
moving those existing responsibilities is outside this repair.

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

## Authorized integration and publication — 21 October 2026

The owner requested integration of `codex/categorized-message-flow` at
`f5df9d6203a41569fba05645ef2b26d4d116f41f` into `main` and activation through
the existing deployment command. The live database source matches `b20d1be`.
The executor pins the complete database trees for that exact code-only exchange;
all migrations, dependency contracts and runtime requirements stay identical.
The publication commit adds the exact transition guard, synthetic guard tests
and this record on top of the requested application commit. The existing
publisher also transports optional worker/directory installers only when their
explicit mode needs them, retaining the same source and SSH-argument budgets.
Invitation/search verifiers retain their directory-contract dependency.

Require the exact integrated main commit to pass the complete CI workflow before
activation. Preserve the existing push trust-store mitigation and separately
approved provider egress maintenance. Access, baseline hashes, operational
scripts and live-test evidence stay in ignored `.local/`. Use the current
executor's own worker lifecycle, preservation and rollback checks; do not change
shared services, packages, infrastructure or database schema for this release.

**Ponto importante:** publication updates categorized message/receipt routing and
may briefly interrupt the app's own services during the existing release swap.
CI and deployment health checks do not establish physical-device delivery
latency or browser acceptance; those remain separate observations.
