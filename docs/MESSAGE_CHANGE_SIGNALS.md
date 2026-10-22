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
alternate during continuous typing. Counters, sound and visible read
receipts after a committed page run outside the receipt turn, so a slow
follow-up never holds the next live page. Live receipt asks for interactive
authority priority, ahead of queued maintenance. While a visible, focused app
window exists, the service worker shows no private message alert and does not
decrypt one (owner-approved on 22 October 2026): the app already shows the
message and plays its own alert, and a second decryption would hold the shared
account lock the app's receipt waits for. Calls and public alerts still show.

Tabs of one device share the receiver's durable checkpoint, and only visible
tabs receive. Each receiver turn reports the checkpoint it loaded; when another
tab advanced it past the cut this tab knows, this tab's open latest window,
already stored locally by the other tab, is read again and the list refreshes
its previews. A receipt that was idle because another tab applied it no longer
leaves the open chat stale. That window is read on its own, once per open chat
and checkpoint revision; it never asks the receiver for another page, which
would be idle again and, while the window stayed behind, repeat without end
(two-tab field capture of 22 October 2026: a turn every ~0.5 s holding the
shared lock and starving the other tab). A live receipt failure offers the retry
action, as the selected read it replaced did. The list and account inbox
continue working when no conversation is selected.

An append hint keeps retained verified windows reusable; only a generic or
removal wakeup blocks reuse, until a receiver batch that started after it
commits, so sustained appends cannot starve navigation. The receiver keeps the
validated manifest of the frozen journal cut in memory (at most 256 metadata
items) while it applies the cut's pages, instead of fetching it again for each
page; a restart, another cut or any failure fetches it again, and each page
still confirms the cut's fence. The conversation list follows the receiver's
commits: a live journal page's new message becomes its conversation's preview
directly. Removing or editing the shown preview, recovery rows and non-journal
cuts keep one bounded list read, deferred while startup or a text send is
pending.

Group content and receipt hints no longer refresh the group directory. With
the group open, a content hint re-reads only that group after verifying it,
and a receipt hint fetches only its delivery/read metadata without decoding
history; both then refresh the unread counters and alerts. A background group
page refreshes counters only. Only a general wakeup refreshes the group list,
governance and profiles, which may stage or publish a profile.

Group reads use finite cuts (migration 098, owner-approved on 21 October
2026). The group snapshot also returns `anchor`, the highest packet sequence
under the group row lock that serializes inserts, and `invalidation`, the
latest revision that removed or concealed content: an author deletion or
retention cleanup clearing a body or setting a deletion, or media moving to
`deleting`. A scope carrying both bounds stays current through later appends,
edits and other media transitions, and every index, change, object, relation
and recent read is bounded by its anchor; a later removal still returns 409.
An unfinished cut is continued after later appends instead of restarting.
Scopes without the bounds keep exact revision equality, so older clients keep
working. The migration fails if the packet identity does not use `CACHE 1`.
Media upload transitions still bump the revision, as the owner decided.
Deploying 098 needs its own reviewed transition.

Private sends keep their outbound Megolm session while the audience is
unchanged (owner-approved on 21 October 2026). Each send batch opens a new SDK
wrapper, which used to invalidate the session on its first message and send a
new room key to every device of both accounts. The message controller now keeps
a session-scoped memory of the audience, both directory hashes, that each SDK
identity already shared the session with. It is memory only and bounded; it is
cleared on logout, session change, authority suspension and hide, and a reload
starts empty, so the next send rotates once. Any device added, revoked or reset
on either side changes the audience and rotates, and another SDK identity never
reuses an entry. An audience is recorded only after the key share succeeded.
The SDK's own rotation limits still apply.

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
