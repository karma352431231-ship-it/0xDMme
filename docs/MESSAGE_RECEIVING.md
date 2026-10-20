# Receiving messages without opening a chat

The owner requested account-wide receipt independent of the selected contact on
20 October 2026 and explicitly authorized splitting the chat hotspot first.

## Ownership and review order

1. Extract the existing private/group receipt scheduler into `messages/inbox.ts`
   in a separate commit, retaining pagination, cancellation, retry and generation
   behavior. `messages/synchronization.ts` continues to coordinate foreground
   actions and refreshes; the screen only wires these owners together.
2. Correct account receipt wakeups and automatic-work arbitration in those
   modules. Verify a disconnected chat view, another selected contact, slow page
   completion, logout, invalidation and user preemption.
3. Keep handle inbox receipt separate from the DM screen and notification
   projection. Its authenticated history reader remains the owner of crypto,
   durable storage, removals and cursors.

The existing controller and screen remain hotspots. Further cuts should isolate
private packet verification/storage first and conversation rendering/navigation
second, each as a reviewed change. The main risks are premature acknowledgement,
reusing stale authority and overlapping SDK/store lifetimes. Existing recovery,
receipt, coordinator and visibility tests must accompany those cuts.

## Invariants

- Receiving belongs to the authenticated account, regardless of chat selection.
- A received message is not automatically read. Only a visible, verified window
  advances read state, subject to the existing preferences.
- Receipt pages remain bounded and cancellable for user work or session loss.
  Routine maintenance must not repeatedly abort a page that is making progress.
- Hidden/offline/suspended browsers retain their existing deferral policy;
  resuming the browser requests current authority before projecting content.
- No new server endpoint, schema, crypto format, dependency or telemetry is needed.

## Implemented flow

`MessageInbox` now schedules private/group receipt independently of a mounted
directory. Automatic presence and decoration yield to an unfinished page;
foreground user work retains cancellation and priority. Completed receipt
refreshes list projections without marking messages read.

`communities/dm-inbox.ts` owns account-level handle receipt and browser wakeups.
It receives authenticated history once per coalesced account update, before
projecting paginated notification counts. An empty directory does not initialize
an alias. Account replacement removes its lifecycle listeners, and failures or
stale generations cannot publish counts.

Regression coverage lives in `message-synchronization`, `message-coordinator`,
`message-resume`, `dm-inbox`, `social-unread` and `social-dm-work` tests. Device
delivery timing still requires a new live capture after publication.
