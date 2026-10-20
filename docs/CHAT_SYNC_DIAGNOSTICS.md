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
