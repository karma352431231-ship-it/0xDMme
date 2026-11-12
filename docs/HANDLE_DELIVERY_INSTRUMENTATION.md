# Handle delivery instrumentation and code findings

## Scope

This revision instruments delivery of E2EE DMs addressed through public handles.
It does not change chat scheduling, authorization, cryptography, retention or
upload concurrency. No latency improvement is claimed before matching captures.
Raw operational reports remain local and outside Git.

## Findings from the supplied reports

The sender recording started at 21:03:47.216 on 11 November 2026 (UTC−03), lasted
49.224 seconds, and the receiver recording started at 21:08:02.617 and lasted
19.406 seconds. Those are the recorded device wall times, not independently
synchronized clocks. The files do not establish complete delivery of the same
message. Their app bundles also differ: sender `app-f22898de473942b9.js`, receiver
`app-7029c9a2a63bf600.js`. Both advertise older send coverage but lack the handle
hooks present in the newer console script. A script cannot install missing app
hooks. The old panel failed to make this incompatibility obvious.

Two text sends took 1,450 ms and 1,573 ms from gesture to acceptance. The first
publication response took about 145 ms; that is round-trip time, not isolated
server execution time. Preparation walks the private authority, own handle
directory, recipient directory and recovery key, then verifies Matrix devices
and distributes a room key when needed. Background requests overlap this work
and must not be added to its critical path.

`SocialDms.identityTurn` rereads the own handle directory for every crypto turn.
`sendPeer` caches the peer directory and recovery key only inside that turn;
`cryptoTurn` creates a fresh `sendPeers` map each time. `MessageCrypto.encrypt`
queries the sender's devices and then the recipient's devices. These two queries
have different subjects and are not duplicate requests within a single send.
They repeat across separate sends. The second capture's text did not require
another room-key distribution, but still performed both queries.

Existing reuse already covers runtime initialization, the handle identity
secret, account/device/directory-scoped recovery capsules, audience information,
and very short same-turn private-directory followers. Repeated calls to
`ensureMessageRecovery` therefore do not necessarily make repeated HTTP requests.

Candidates for a later optimization are coalescing repeated reads in one
verified turn and retaining verified peer results with explicit invalidation.
Any longer reuse must account for session/device changes, signed directory and
epoch changes, rollback checks, peer recovery-key rotation and rejection/retry
rules. Matrix key reuse additionally needs evidence of current SDK/device-key
state; directory revision alone is insufficient to assume the keys are current.
Publication rejection cannot undo key distribution that already happened.
Review authorization of distribution endpoints before broadening this cache.

Receiver foreground cycles lasted 4,296 ms and 4,424 ms. During the recorded
intervals, group synchronization occupied exclusive turns for 1,534 ms, 887 ms
and 931 ms. Handle history turns occupied 1,207 ms and 1,127 ms and performed
multiple sequential requests. Most individual DM round trips were roughly
125–150 ms. Foreground loading spans several distinct authority acquisitions;
it is not one network operation. Nested `inbox` timings include queue waits and
must not be summed with their children. The maximum 3,563 ms authority wait was
for a DM status operation, not proven message arrival.

`AuthorityWork` already prioritizes interactive work, bounds waiting to eight
seconds, and admits one maintenance turn after four interactive turns. Existing
work cannot be preempted safely while it owns the native/SDK store. A later
optimization can evaluate deferring _not-yet-started_ maintenance and reducing
its turn size, while preserving bounded maintenance progress, confirmation and
cursor durability. Do not run incompatible SDK operations concurrently.

The image publication succeeded at HTTP level without an internal acceptance
or accepted-check hook in the captured app. HTTP success alone is not acceptance.
The subsequent text summary retained file slots and inspection counters because
`CompositionMetadata.read` returned a partial empty-file snapshot, and the
summary merged it into a previous selection. The actual view-once flag came
from the composer; residual file metadata does not prove a file was sent.

## Protocol and readiness

Use the app hooks and console script from this revision together. The report is
schema 3, with handle diagnostic revision 2. Its public content-addressed app
bundle names identify web/native frontend assets. Old reports remain readable
but cannot satisfy complete-delivery comparison.

Run the entire generated `build/chat-lag-console.js` in each device's inspected
WebView/browser console. Use a fresh capture and a fresh pairing code:

```js
// Sender: returns a temporary code; copy this code to the other console.
__0xdmmeLag.pair();
// Recipient: supply that same returned code.
__0xdmmeLag.pair('the-32-character-code-returned-above');
__0xdmmeLag.ready();
```

The panel distinguishes unavailable hooks, incompatible revisions, missing
pairing, pairing failure, missing server clock samples and inconsistent clocks.
Pairing is acknowledged after the ephemeral HMAC key is usable. Both panels
must say **Ready locally** and show the same pair fingerprint before sending.
One device cannot establish the other device's readiness without its report;
`peerConfirmed: false` makes that limit explicit. The code and real message IDs
are never exported, persisted or sent to the server. Tags and fingerprints are
scoped to the operator's fresh pairing code and the capture's bounded lifetime.

The clock sample comes from a numeric server timestamp on existing responses.
Android and iOS forward only this additional allowlisted response header.
There are no calibration requests, external services or diagnostic message
payloads. A server that has not been updated, or an older native bridge that
strips the header, leaves readiness at clock-pending. Device and server updates
are therefore prerequisites for the new complete-delivery capture.

Each sample bounds server offset between request start and response headers,
including millisecond quantization. Samples must have overlapping bounds;
disagreement disables comparison. `compare` joins matching HMAC tags and
returns cross-device duration intervals, with a stated 100 ppm clock-drift
allowance over the captures. It does not assume symmetric network delay or
identical device wall clocks. This is a bounded estimate under the stated drift
assumption, not an exact one-way measurement. Negative intervals are flagged; a recipient can download before the sender
receives its acceptance response, so that alone is not a clock failure. The
comparison separately reports whether the recipient capture demonstrably began
before the send click.

## Milestones and attribution

The sender summary joins the observed gesture to its internal message slot and
paired tag, authoritative acceptance, and the first accepted check in visible
DOM. Attachment staging announces the stable ID before waiting for authority;
publication and reconciliation keep the same ID. A background retry cannot
silently take an unrelated gesture's summary. Empty file snapshots reset all
file slots, counters and inspection flags; late inspection only refines its
original selection.

The recipient records account-wide hint arrival and refresh deferral state;
foreground queue/start/end; each authority queue/admission/execution/end with
priority, fixed owner category and caller positions; batch availability;
per-message processing and decryption start/end, verification and persistence;
and first DOM insertion and visible frame opportunity. A row initially outside
the scrollport remains observed until visible, navigation or capture shutdown.
A frame opportunity is not proof of physical pixel paint or a human read.

A handle-read capability links its authority turns and downloaded messages. A
hint is an empty account-wide wakeup, so its link to a read is a **candidate**,
not proof that a particular message caused it. No per-message server hint was
invented. Paired message tags establish the actual cross-device identity.

Detailed events retain the existing 1,500-event limit. Separate summaries keep
five send cases, 128 messages, 128 reads, 512 authority operations and 64 refresh
events. Overflow and dropped details are explicit. Instrumentation is local,
opt-in and expires after ten minutes; pending observers and late callbacks end
with that capture. No actual delivery capture is run as part of unit validation.

## Next short capture

After matching app/server builds are installed, start both captures and confirm
readiness before one text send, then one image send, waiting for each to settle.
Stop both just after the recipient displays the messages. In the inspected
Android console on the Mac, copy the result with:

```js
copy(JSON.stringify(__0xdmmeLag.stop(), null, 2));
```

Keep both reports. `__0xdmmeLag.compare(recipientReport)` in the sender's console
can compare a parsed recipient report; returning the two files for analysis also
preserves all timing intervals and missing-stage evidence. Review the attributed
critical path before implementing or claiming a latency optimization.

## Latency correction follow-up

The accepted-media presentation, verified receiver turn reuse and operator
pairing controls are described in
[Handle chat latency corrections](HANDLE_CHAT_LATENCY.md). Timing gains still
require the owner's matched device captures.
