# Browser capture for repeated chat synchronization

Scope: repeated private-chat checks during navigation and while idle. The owner
confirmed that updating the app resolved the sender label and stale public
alert on 20 October 2026, so notification behavior is outside this capture.

Use the existing `npm run diagnostic:chat` console meter to capture the remaining
sync during conversation switches and unexpected checks in an unchanged chat.
It runs only in the current tab, stops after ten minutes and retains at most
1,500 events. Stop restores the wrapped browser operations. It never publishes
a message, changes permissions or sends the report automatically.

The trace includes user clicks (anonymous DOM row slots and whether the clicked
row was already selected), the syncing indicator and rendered message count,
request/body timing, authority-lock wait/hold time, event-loop delays, stream
control frames, local invalidations, other-tab/device wakeups and push wakeups.
Row slots describe retained DOM elements, not durable contact identity.
Work timings also separate the per-turn critical path: `authority/directory`
(directory fetch and checkpoint inside each online vault turn), `sdk/open`,
`sdk/prepare` and `sdk/key-inbox` (the bounded Olm inbox drain), next to the
existing `authority-queue`, `storage-exclusive` and `messages/<operation>`
request timings. They carry fixed names and durations only.
Caller positions refer only to hashed application bundles. Existing streams and
locks that started before installation have the coverage limits in the report.

Capture an A→B→A switch, click the currently selected contact once, then leave
that chat untouched for at least 65 seconds to include two 30-second foreground
maintenance ticks. Mark any visible delay, then download the report. Install
before the actions, and keep the same tab without reloading during capture.

Code inspection already shows that selecting a conversation closes its current
projection and asks for an authenticated snapshot, even when a session candidate
exists. That is not proof of a full history download. The capture must distinguish
snapshot/confirmation checks, actual page/object/crypto work, lock contention,
and unrelated live/maintenance triggers before changing synchronization rules.
Preserve current permission, revocation, receipt and cache checks while fixing
the measured path. The existing screen/controller hotspots receive no new
application responsibility from this diagnostic tool.

## Captured navigation and correction — 20 October 2026

The supplied 16,016 ms capture contained 450 events without drops. Three row
opens took 5,282, 3,097 and 2,666 ms to return to idle. There were 96 request
starts, including 41 `devices/read` operations; all 95 completed responses were
HTTP 200. The maximum observed native lock acquisition wait was 2 ms. That
does not include the controller's internal authority queue or time awaiting a
maintenance operation. The exact published bundle was matched to release
`5673246` to identify otherwise generic caller positions.

The capture did not contain a full message index/page download. It did contain
repeated vault/removal reads, relation/delivery checks and unrelated group,
presence and public-profile work. A first window still needs authenticated local
content assembly; a cached window should not repeat it. DOM row slots cannot
prove that the third click returned to the first account after a row rerender.

The corrected cached-window path obtains current device authority and uses the
existing server `delivery` operation as its snapshot check: that operation
validates the exact message, contact and directory revisions in its authorized
read transaction. It verifies every online packet ID/hash before publishing one
complete window. Empty or entirely archived windows use `confirm` instead.
Hints during the check require a new check, bounded to three attempts. Only the
specific stale-snapshot conflict falls through to a fresh snapshot/full-window
read; revocation and other failures still close the gate. Freshly assembled
content retains its separate final authority and confirmation.

Opening an uncached private window no longer requests another account-wide
private/group receipt pass. Startup, live activity, reconnect, offline fallback
and imported history retain their existing receipt wakeups. Navigation alone is
not incoming activity. The coordinator regression verifies idle inboxes stay
idle after navigation and resume on a subsequent live event.

The report has no idle interval long enough to exercise the 30-second tick, so
it does not establish the cause of an independent idle refresh. A new capture
after publication must include the complete A→B→A and 65-second idle sequence
above. Synthetic regressions establish request reduction and gate behavior,
not real-browser timing. Current maintenance still finishes its active safe
operation before a requested opening takes SDK ownership.

## Connected-session navigation approval — 20 October 2026

The owner reported that the deployed correction still displayed synchronization
on every switch. That correction reduced requests but intentionally retained an
online gate for every reopen. The owner then explicitly approved immediate
display of already validated history during the same connected session,
accepting the interval before a remote update reaches the app. This supersedes
the per-reopen gate above for these retained candidates only.

Confirmed conversations now record the live connection epoch in which they were
validated. Navigation can publish an eligible complete window without authority,
storage or network work. Its selected-history check and read receipts coalesce
in the existing background scheduler, outside the foreground syncing state.
Normal live updates and periodic recovery remain active. Foreground mutations
and current SDK work retain their exclusive lifetime; an occupied engine may
still delay a requested opening until its current safe operation finishes.

Stream loss and account/browser suspension invalidate immediate reuse.
Returning to the contact directory alone preserves the connected reuse epoch.
Removals, authorization changes, session replacement and verification failures
discard eligibility. Reconnecting alone cannot make an old candidate eligible;
it needs a new authenticated verification. First opens, older pages and evicted
windows still use the blocking history path. The existing 16-conversation,
4096-row and 8 MiB candidate budgets remain unchanged.

`messages/visits.ts` owns the new navigation/background scheduling responsibility;
the screen adds wiring only. Actual-controller tests cover zero-IO reprojection
and every invalidation boundary, while coordinator tests cover immediate
selection, an enabled composer and one background check for a navigation burst.
Real-device timing and the unexplained idle trigger still require a new capture;
synthetic results do not establish either latency or stream behavior on Opera.

## Internal reuse decisions — 20 October 2026

The meter now asks an updated app build to enable an explicit, local diagnostic
bridge for this capture. `reuse-coverage.available` reports whether that bridge
answered. An old app keeps the network/UI capture but displays an update notice;
an absent internal event must never be interpreted as proof of a cache hit.

The new timeline records the decisions themselves:

| Event                       | Evidence                                                                                                                                                                                 |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `reuse-cache-stored`        | A verified window entered the bounded cache.                                                                                                                                             |
| `reuse-cache-removed`       | One window was replaced or discarded: changed snapshot, affected message delta, conversation count, rows or byte budget.                                                                 |
| `reuse-cache-cleared`       | The complete cache was discarded: profile change, controller close, removal, hidden/invalidated projection or verification failure.                                                      |
| `reuse-cache-invalidated`   | Content remained a candidate but became ineligible because of a live hint, account pause or disconnected live epoch.                                                                     |
| `reuse-cache-confirmed`     | The authenticated snapshot completed its cache reconciliation.                                                                                                                           |
| `reuse-cache-check`         | The actual lookup found an eligible window, no window, pending confirmation, a disconnected stream or a different live epoch.                                                            |
| `reuse-navigation`          | The visit was restored or blocked by connection, engine ownership, unavailable history, voice preview or projection. Busy, maintenance and pending-text flags accompany visit decisions. |
| `reuse-projection`          | The controller restored the window or rejected its projection.                                                                                                                           |
| `reuse-verification-failed` | A failed probe/read discarded reuse; distinguishes a changed local generation from authorization, conflict, abort and other failure categories. No exception text is exported.           |

Events include cache totals, current/window epochs and anonymous source and
conversation slots. Conversation slots link the same contact across DOM
replacement within the capture, retaining at most 128 recent mappings. Source
slots distinguish controller/navigation and cache instances. Bundle-only caller
positions locate the discard or denial without exporting arbitrary stack text.
The bridge retains no events and uses no persistent storage or network IO. Its
temporary mappings are cleared on stop or after ten minutes. Reports retain the
existing 1,500-event bound and disclose dropped events.

Install the new console meter **before** A→B→A, then include the idle interval.
There is no retrospective eviction history: a window already missing when the
capture started has an unknown earlier cause. Start before a reload/reconnect
only if the meter is reinstalled afterward; reloading ends the previous capture.
This instrumentation preserves synchronization, admission, eviction and authority
rules. New capture evidence is still needed to identify the user's actual cause.

The new bridge and protocol own diagnostic delivery. The existing message
screen/controller hotspots receive small trace calls only; their separate
navigation/rendering and verification/storage extraction remains described in
[message receiving](MESSAGE_RECEIVING.md#ownership-and-review-order).

## Bounded first opening and multi-tab startup — 22 October 2026

Two-tab field captures showed that the first opening of a private conversation
after a reload read the account-wide metadata index one page per foreground
turn. Each page paid its own state request, device authority and admission,
and unrelated maintenance ran between pages, so opening took 10–30 seconds and
grew with the whole account's history.

On a finite (v2) cut, opening now reads only the selected conversation through
`sync-peer-window`. The server returns, inside one authorized read transaction
that first validates the cut, the window a complete scan would collect for that
peer: up to 16 live roots before an optional older-history cursor and each
participant's latest profile packet. Each direction walks the existing
sender/sequence index downwards from the cut, so the query cost follows the
window rather than the account. `messages/peer-window.ts` rejects any row from
another conversation, beyond the cut, at or after the cursor, a relation or a
deleted root before publication. Relations, packet opening, delivery and the
final confirmation remain the same steps as for a window taken from the index.
A catalog already complete for the cut is still reused without a request;
legacy snapshots keep the complete index. Deletion cleanup outside the visible
window stays with the account receiver. An integration test checks that the
window equals the complete scan at the same cut, with interleaved conversations,
edits, deletions, profiles and an older-history cursor.

Presence heartbeats now keep only the latest desired state: while one runs,
later visibility changes replace a single pending follow-up, so a burst of tab
switches costs at most two account turns and still ends in the final state.
Contact startup refreshes the vault, renders the directory from its verified
heads and only then opens identity pins; startup, histories and sends still wait
for those pins, and a contact row grants no message authority.

Persisted startup projections and a single cross-tab owner for shared receipt
work are not part of this change. Real-browser timing still needs a new
two-tab capture after publication.

The owner requested integration of `898865f` into `main` and VPS activation on
22 October 2026. The existing deployment command pins both complete database
trees from `60eada3` to `898865f`, accepting only `message-index.ts` and
`messages.ts`. All migrations, write paths, dependencies and Node remain
unchanged. Activation requires the exact pushed integration commit to pass the
full CI workflow, a local build, preservation checks and retained code rollback.
The existing controller/screen hotspots still require the separate verification
and rendering extractions described in [message receiving](MESSAGE_RECEIVING.md#ownership-and-review-order).

## Startup priority and batched authority turns — 22 October 2026

After the bounded opening shipped, captures still showed the contact list
about 7 seconds after the first authority turn with one tab and 13–18 seconds
with two. Until then the account ran 23–35 exclusive turns one after another;
every turn read the device directory again, which was half of all requests.

Communities and the public profile started their session work from their own
session change, outside `SessionBoot`, so public DMs, the feed and profile
state queued first. The live stream's two signed handshake turns then waited
as maintenance behind them, and the directory refresh waits for that
handshake. Both modules now accept a coordinated startup option and, with it,
wait for the `ready()` call `SessionBoot` makes after the private directory's
first load. A visible page signs the live handshake with interactive priority.

`AuthorityWork.hold` lets operations already waiting for the same account and
priority follow a running operation inside its native turn: at most three
followers within one second, and any failure ends the batch. Maintenance never
takes a follower while interactive work waits, and interactive batches keep
the four-to-one maintenance share. A follower reuses the directory its leader
read; nothing survives the turn. Every request still carries the signed
directory, and the server checks the current session, the directory and this
device's membership on each one. Callers settle inside the turn, so the native
lock may be released slightly after a caller resumes.

Real-browser timing still needs a new one- and two-tab capture.

## Separate signing lane — 22 October 2026

Keeping optional owners behind the private directory made the feed wait for
the whole message warmup, because community and public profile requests still
queued for the exclusive account turn even though they only sign. That turn
protects the vault, key ring and SDK store, none of which these requests use.

`devices/signing-lane.ts` now runs work that needs only the session, directory
and signature outside that turn, at most four operations at once. Each
operation first reads the server's device directory after the event count the
last exclusive read verified, and proceeds only when the server reports no new
event, the same revision and the same head. Otherwise, or before any verified
state exists, it runs in an exclusive turn, which verifies and stores the new
directory; the lane never writes the local checkpoint. Directory freshness per
request is therefore unchanged, and the server still checks the session, the
signed directory and this device on every request. Community and public
profile requests use the lane; public DMs, the vault and message work stay in
the exclusive turn.

The feed then still waited for `SessionBoot`, which released communities and
the public profile only after the whole message warmup. With the signing lane
that wait has no purpose: a mounted feed and the public profile start on
session change again. Work reaching the lane before the first exclusive turn
verified the device directory waits up to eight seconds for that verification
instead of queueing for the exclusive turn. Public DMs, which still share that
turn, keep starting from `SessionBoot` after the private directory's warmup.

## Group text queue — 22 October 2026

Sending in a private group ran the whole chain as one foreground operation:
save the draft, reload identities, verify the group, send through the SDK,
save identities and reread the window. The composer stayed disabled until all
of it finished, so a second message had to wait for the first. Plain group
texts now use the same `TextSendQueue` as private chats, moved to its own
`client/text-send` module: the composer clears at once, each text is saved in
order to its own group's encrypted outbox (`composeText`), and one background
transmission sends whatever is pending. Attachments and voice keep the
foreground path. Group texts do not yet get the optimistic bubble private
texts show; they appear once the batch is sent.

## Group send latency — 23 October 2026

A three-message capture showed each group text taking about 1.5–2 s from
submit to an accepted publish (the publish itself about 145 ms) and about
3–3.6 s to the next history confirmation. The queue stayed in its sending phase
until a full selected-history readback finished, so the next transmission
waited for it, and live hints and post-send readbacks each ran their own read.

- A transmission now ends once the server accepted and the outbox entry was
  cleared; the readback is only requested. `groups/reconciliation.ts` is the
  single owner of a group's readback: live content hints and post-send
  requests share it, a request during a read costs one more read, and reads
  never overlap.
- Drafts keep their queue ID as the message ID and a persisted admission
  order; sending reads every outbox page and sends in that order, routed to
  each draft's own group. Participant directories are read once per batch.
- Text drafts are staged with the device's verified local authority; sending
  still revalidates the group, its members and their devices online.
- `groups/outgoing.ts` shows an own text from the moment it is typed until the
  verified history contains the same ID. By the owner's decision, pending and
  accepted texts show one check and a received text two, with no state
  phrase; this applies to private pending bubbles too.

Recipient-side latency was not measured; a paired sender/recipient capture is
still needed.
