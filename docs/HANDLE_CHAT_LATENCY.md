# Handle chat latency corrections

## Evidence and scope

The owner supplied the schema 3/revision 2 follow-up at line 341 of the local
`VIEW_ONCE_SEND_LATENCY_PLAN.md`. The implementation starts at integration
commit `2fd45122`. The plan reports 3,406 ms from image acceptance to its first
check, text acceptance around 1.26–1.53 seconds, and receiver read-to-frame around
2.39–2.78 seconds. These are observations in the supplied analysis, not timings
measured by this implementation task. The two capture windows do not overlap
and lack matching paired tags, so their individual durations cannot establish
one message's complete cross-device delivery time.

This change addresses the accepted image path, verified receiver work, bounded
sender preparation and operator pairing controls. It changes no database,
dependency, retention rule, message format, authorization rule or native bridge
protocol. Measurements on real devices remain with the owner.

## Accepted outgoing attachments

`SocialDms.sendMedia` now emits a typed client-only acceptance result containing
the stable ID, destination and staged authenticated attachment descriptor. It
uses the same result after a successful publication and after recognizing a
previously accepted retained packet. A refused or ambiguous publication cannot
produce that result. Durable upload cleanup and retry remain with `SocialDms`.

`DmOutgoingMedia` owns accepted rows and scoped local preview copies. It captures
the current session before sending, copies chosen bytes only at acceptance,
shows one accepted check immediately, and preserves the original caption. The
first check no longer awaits `conversation()`, a receipt or history readback.
Later content refreshes use the existing coalescing coordinator. Acceptance is
not delivery or read status; those still require their existing receipts.

History merges by stable ID, so the accepted projection and verified message
cannot produce two rows. The preview owner hands a fresh buffer to the existing
verified attachment presenter only when the file hash also matches. That
presenter owns its returned bytes, Blob URL and cancellation. Otherwise the
preview stays owned by the accepted projection. Copies are bounded to 64 rows
and eight MiB including an allowance for displayed Blob bytes; eviction forgets
only volatile accepted presentation. Session/security invalidation wipes buffers
and revokes owned URLs. Late callbacks from the previous session cannot restore
a projection. Navigation does not retarget the send.

The composer captures destination, draft revision, edit/reply context and media
before waiting for the foreground queue. Completion clears only that submission
if the same draft is still current. Text entered later, another conversation's
draft and a newer media choice remain intact. Image preparation uses a separate
media revision, so typing a caption does not discard a photo still preparing.

## Verified receiver path

Previously the final received page released its crypto/authority turn, then
acquired a second online authority for final snapshot confirmation and another
local authority for cached-history assembly. The confirmation and assembly now
use the final page's already authorized context. This removes an additional
private-directory validation and two separate authority acquisitions on that
path. The finite target and the final snapshot request are still required.

The candidate is assembled with the exact existing `cachedPage` operation,
including local removals, related actions and deleted-root filtering; it is not
constructed from just the newly downloaded items. `DmHistorySynchronization`
still validates `confirmDmHistory`, current generation and cursor persistence
before returning a presentation permit. Failure of confirmation or cursor save
exposes no candidate. A concurrent owner that did not request this projection,
an unchanged cursor, offline history and resumed partial progress retain the
existing cached-read fallback. Background-only receipt and backup export retain
their existing page/confirmation contracts. Each final page remains bounded and the native
and SDK operations remain exclusive. The turn now holds through one confirmation
request and the local window assembly; its effect on other interactive work
must be checked in the owner's capture.

Receipt acknowledgement stays before final confirmation and presentation,
preserving its existing retention semantics. The account inbox, history cursor,
continuation policy and scheduler priorities are unchanged. Local diagnostic
spans distinguish final confirmation from cached-history assembly; nested spans
must not be summed as independent work.

## Sender preparation

Peer directory and recovery-key lookup do not depend on each other's response.
They now start together inside one verified send context. Both must settle
before that turn releases, including errors: directory checkpoint verification
must not outlive the authorized operation. Only successful results enter the
existing per-turn cache. Repeated sends in a bounded burst reuse that result;
recipient-directory conflict handling still invalidates it and retries once.

No longer-lived key cache, Matrix store sharing or skipped device-key checks was
introduced. Own and peer device-key queries have different subjects. Keeping
those checks preserves rotation, revocation and distribution failure recovery.
The expected saving is one metadata request's sequential wait, not a measured
end-to-end improvement.

## Pairing and acceptance capture

The console meter now offers **Sender: create code**, **Copy code**, and
**Recipient: use code** controls. Compatibility gates them; pairing is confirmed
by the app's ephemeral fingerprint. Compare the same fingerprint and **Ready
locally** in both panels before sending. The code stays in the local control and
is cleared when capture stops. No raw message ID, content, handle or diagnostic
code is sent to the backend or included in exported reports.

Use the generated script from this revision on both devices. The existing
`pair()`, `ready()`, `stop()` and `compare()` console APIs remain available.
Matching fingerprints, matching per-message tags and overlapping capture
windows with clock uncertainty remain prerequisites for cross-device results.
A local ready state does not claim the other device is running. The comparison
refuses cross-device deltas when clock bounds cannot confirm capture from before
the send click through the recipient frame, including a sender capture stopped
too early. Local processing durations remain independently useful.

See [handle sender preparation](HANDLE_SENDER_PREPARATION.md) for the sender-only
comparison and the fields that break down durable draft preparation.

For the owner's next run, record text and the same image several times with the
destination visible, then test another selected conversation. Include one
sender-only acceptance run while the recipient is offline. Report separately:
click-to-acceptance, acceptance-to-check, recipient read-to-download, processing,
stored-to-frame, queue wait, and paired click-to-frame intervals when available.
Include app bundle IDs and meter revision. No new device captures were performed
during implementation, so no measured latency reduction is claimed yet.

## Verification and structural review

Regression coverage exercises immediate accepted presentation while readback is
held, new drafts, navigation, failed publication, lost-response reconciliation,
stable-ID replacement, preview ownership and logout. History tests cover inline
confirmation, changed removals, cursor-save gating, priority and the cached-page
fallback. Sender tests retain real SDK encryption and verify concurrent metadata
reads settle fully on failure. Pairing controls have an operator-flow regression.

The outgoing owner owns preview memory and cleanup; history synchronization owns
the final presentation gate; the composer owns draft revisions; and the existing
scheduler owns serialized work. Screen changes only compose these contracts.
Preexisting broader controller/composer coupling was not expanded with a new
scheduling or storage responsibility. Any further extraction should separate
media transmission from `SocialDms` first, retaining its atomic retry packet and
cleanup sequence, then split composer media preparation with a clear session
lifecycle; those broader changes are outside this correction.
