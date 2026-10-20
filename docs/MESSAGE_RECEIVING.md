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

## Preview and aggregate-push corrections — 20 October 2026

Each successfully verified inbox page now refreshes directory projections,
without waiting for the other inbox or the remaining history. Private preview
loads and automatic receipt/change reads retry the complete operation once on
the exact message-snapshot conflict. Each attempt obtains fresh authority;
revocation, unrelated conflicts and repeated failures still close the projection
and remain visible. No publication is retried by this helper.

The push sender supplies an aggregate wakeup, not the identity of a private
message. An unread public reply must not repeatedly impersonate new chat
activity. The worker remembers up to 32 displayed public post IDs in one local
record, scoped to a digest of the authenticated session's CSRF secret. No raw
secret, message text, author, wallet or private peer is stored. A session change
replaces that bounded record; clearing browser data resets it. Display does not
mark a post read. A repeated candidate uses the existing generic activity alert
and app link. If there is eligible unread private/group activity, the server omits the public
preview so a mixed wakeup stays generic, including on a fresh browser cache.
That check reuses the same private mute/read/authorization predicate as push
eligibility. This cannot identify the exact event behind an aggregate push;
without eligible private activity, an unseen public candidate can be shown.

Posts and direct public replies both use the author's currently approved public
photo. Private push remains generic under the existing privacy contract. The
notification pipeline and public-alert bookkeeping have their own modules;
the worker only connects browser events. Inspections have one active operation
and one coalesced followup. Cache failure falls back to generic attribution after
successful server authorization.

The owner deferred choosing notifications with the app closed until the options
are explained. Background Web Push, consent, mute, call behavior, schema,
dependencies and private-message confidentiality are unchanged.

This correction stays on `codex/chat-preview-notificacoes`, as requested. The
existing deployment command accepts the existing on-demand `check.yml` workflow
for the exact pushed task-branch commit; main still requires push-triggered CI.
The same repository, latest-run, SHA, branch, workflow and success checks remain.
This aligns the executor with the workflow's existing task-branch policy and
allows activation without merging this correction into main.
