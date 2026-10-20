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

## Owner clarification: private Web Push only — 20 October 2026

The owner explicitly limited Web Push to private chats. This supersedes public
post/reply push previews and the previous proposal to deduplicate those previews.
The public area, including communities, followed posts/replies and handle DMs,
keeps its in-app updates and unread counts without OS push alerts. Existing
private contact/group message eligibility, mute, authorization and private call
controls remain in force. The open/closed-app notification preference is still
undecided; this clarification does not select one of those modes.

Remove public admission into the push queue, public eligibility, authenticated
public preview lookup and worker presentation together. Public transaction
notifications still wake open app clients after commit, including recipients
without push consent. A public event must not change a pending private marker or
its generation. Old pending jobs with only public activity are ineligible.
Remove the unused public preview/avatar/deduplication modules and their profile
dependency. The worker ignores public data even if an older response includes it.

Private push remains generic under the previously approved contract: the isolated
sender has no message identity, plaintext, contact photo or E2EE keys, and the OS
alert does not disclose them. This is a product/architecture choice, not a Web
Push protocol requirement. The owner asked for an explanation, not a change to
that disclosure policy. No message text or photo is sent to the backend to make
notifications richer. The notification pipeline remains in its own module, with
one active inspection and one coalesced followup.

Regression coverage checks that public posts/replies remain visible in-app but
neither queue nor authorize push, preserve an existing private marker, and cannot
inject public text, author, avatar or destination into an allowed private alert.
Private delivery and mute remain tested independently of public activity.

This correction stays on `codex/chat-preview-notificacoes`, as requested. The
existing deployment command accepts the existing on-demand `check.yml` workflow
for the exact pushed task-branch commit; main still requires push-triggered CI.
The same repository, latest-run, SHA, branch, workflow and success checks remain.
This aligns the executor with the workflow's existing task-branch policy and
allows activation without merging this correction into main.
