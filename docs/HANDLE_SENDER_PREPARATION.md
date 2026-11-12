# Handle sender preparation

The owner identified a remaining 741–1,218 ms interval between durable text
draft save completion and draft opening in sender captures of `f0919d86`.
Draft writes themselves took 2–4 ms. This interval includes local authority
preparation, queue admission, current directories and SDK preparation; it is
not a measurement of IndexedDB write latency or recipient delivery.

## Changes

- `SocialTextOutbox` inspects ordinary encrypted FIFO rows directly, without
  opening a second local vault just to read ciphertext. Its existing online
  crypto turn still authorizes and decrypts each draft before transmission.
  Legacy packets retain their authorized migration path and drain first.
  Stable IDs, saved packets, generation checks, bounded FIFO and retries remain
  owned by the outbox. An empty queue opens no SDK store.
- Directory verification uses one checkpoint read for each pin. Current
  snapshots still reject rollback, and historical reads still require the
  stored chain prefix to match.
- `SocialListReads` owns at most 64 in-flight page reads per controller.
  Only equal cursors and equal work priorities share a promise. Settled or
  rejected entries are removed; cancellation, session replacement and list
  mutations invalidate the owner. No result survives as a time-based cache.
  Consumers keep their existing generation guards. The current options have no
  per-consumer AbortSignal; an interactive caller never inherits a maintenance
  turn. Diagnostic caller labels do not change equivalence.
- `DmRefresh` waits while text admission or transmission is pending. Explicit
  navigation and invalidation retain their existing paths. The text owner
  resumes deferred refresh hints as soon as the send queue settles.
- `MessageCrypto` queries sender and recipient devices together using the SDK's
  existing multi-user operation, also used for groups. The individual server
  endpoint already supports two accounts. Both authenticated histories are
  registered before dispatch; binding validation, current-device checks and
  trust application precede session claiming and key sharing. Requests are
  serial and freed on success or failure. A later send queries again.

No fresh directory or revocation check is replaced with a TTL cache. The
accepted-image projection and sequential upload lease are unchanged.

## Capture contract

Use a newly generated console script and a build reporting
`senderPreparationAvailable: true` from `__0xdmmeLag.ready()`.
Meter revision 3 preserves the following fields.

- `deliveryFlow.sends`: anonymous flush slots with `flush-request`,
  `outbox-ready`, `runtime-ready`, `identity-ready`, `authority-request`,
  `authority-ready`, `profile-ready`, `own-directory-ready`,
  `authority-assembled` and `engine-ready` points.
- `reuse-send` / `flush-ready`: links each real draft's capture-local message
  slot to its anonymous `handleSend` flush slot. Several drafts can share one
  bounded flush; retries can acquire a new flush slot.
- `deliveryFlow.authority`: queue, admission, execution and settlement records
  with the same `handleSend` slot. Existing directory work spans retain their
  own execution duration; queue time is no longer also attributed to the
  own-directory span.
- `deliveryFlow.listReads`: request and shared-read counts by fixed caller
  (`directory`, `visible-list`, `identity`, `inbox`, `unspecified`). Authority
  work also carries the initiating caller label.
- Existing `draft-save`, `draft-open` and `device-keys` send stages provide the
  endpoints and combined key-query duration. `device-keys` replaces the two
  individual key-stage spans for new sends.

All points use the sender's monotonic capture clock. Measure adjacent points
or enclosing spans; do not add nested queue/execution durations. Flush and
authority summaries survive detailed timeline eviction, are bounded, and stop
with their capture. They contain no message IDs, cursors, account identifiers,
plaintext or secrets. Receiver delivery still requires paired evidence and
clock uncertainty bounds. Sender-only preparation measurements need no pair.

## Owner acceptance

After release, the owner will compare consecutive isolated texts, texts during
list refresh, and an ordinary image followed by an overlapping text on the
same sender/network. Compare median and range of save-to-open, authority wait,
list/key request counts, click-to-acceptance and acceptance-to-check. Preserve
the earlier 18 ms accepted-image check observation as a reference. Automated
fixtures establish contracts, not a physical-device speedup claim.
