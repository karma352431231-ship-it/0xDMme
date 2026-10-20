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
