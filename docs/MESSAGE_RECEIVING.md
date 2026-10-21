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

Directory preview verification has an account-level lifetime separate from
selected conversation projection. Rapid contact selections and directory-only
navigation cannot discard a valid in-flight preview read. Account replacement,
disconnection, suspension, removals and authorization failures still invalidate
the read and clear its projection. Snapshot confirmation, client-only decryption
and the existing bounded retry remain required.

## Immediate preview from a verified chat window — 20 October 2026

Publishing the selected private chat's complete verified latest window now also
publishes its contact preview in the same synchronous callback, before history
rendering. No second packet read, authority acquisition, network request or
read ACK is required for this projection. This bypasses the remaining startup
warmup and an unrelated slow account-preview batch for that contact only.
The account-wide preview reader remains responsible for other contacts and
fresh read receipts. Existing receipts are preserved only for the same message.

The controller supplies the peer and latest-page flag. Offline views, local-only
archives and older pages cannot overwrite the online latest preview. Projection
uses the existing edited-text/media presentation, excludes hidden profile rows
and does not expose pending drafts. A verified empty latest window or removal
gate clears the affected preview; existing account/session invalidation still
clears the complete list.

The loader tracks a revision for direct verified publications. If an older
account-wide read finishes afterward, its result is discarded and one coalesced
fresh read supplies the remaining list. A failed authorization/snapshot check
still clears all previews, including direct publications; stale generation
responses cannot publish after session replacement. No additional event queue,
plaintext storage or cache budget is introduced.

The projection rule lives in `messages/verified-previews.ts`; the existing
controller and screen add publication metadata and wiring only. Regression tests
cover startup deferral, slow account reads, stale responses, empty/deleted latest
messages, edits, read receipts, older pages, offline/archive exclusion and
authorization loss. Real-device timing still requires testing after publication.

## Detailed push scope — owner clarification, 20 October 2026

The latest instruction supersedes the intermediate private-only interpretation:
public posts/replies, including followed profiles with notifications enabled,
keep detailed Web Push with the approved public author photo. Only handle DMs
are excluded. Private contact/group messages use local decryption by default;
private plaintext, local contact aliases/photos and E2EE keys never reach the backend or
the isolated push sender. The owner explicitly accepted local detailed alerts,
superseding the earlier generic-only private display rule.

Authenticated push inspection supplies at most one current direct-message and
one group-message locator, reusing existing consent, membership, mute, read and
removal predicates. These are not plaintext previews and do not acknowledge read.
The worker obtains the same active session, verifies its digest, and uses the
existing device authority, persisted non-exportable keys, cross-context locks,
pinned identities, SDK recovery, encrypted cache and final snapshot checks.
No browser key is enrolled, copied to a new database or sent to the server.
Private group reading uses an invisible headless reader and never sends read ACKs.

After reviewing the initial generic-then-replacement implementation, the owner
explicitly requested testing decryption **before** alerting on 20 October 2026.
This branch now emits one private alert with locally decrypted details after
rechecking the exact session and still-eligible message ID. There is no preceding
generic alert or later replacement. The single alert honors the device sound
preference. A coalesced direct/group wake selects one eligible detail.

Local decryption has an eight-second deadline. Missing keys, decryption failure
or timeout produce one generic fallback only if a fresh check still authorizes
that same private activity. Revocation, logout, changed consent, mute and read
state suppress both detailed and generic alerts. A cold or large vault can
delay the first alert: the SDK/vault path may need a first load to validate
existing identity pins. Real-device latency is not established by these tests.

New push events cancel older private alert work and replace its pending followup.
Only one local read runs at a time; each latest request starts its deadline even
while an older SDK/store operation releases its lock. An overdue queued request
can alert generically without starting another read, and late decrypted results
cannot replace it. All outstanding work stays inside `event.waitUntil`.
Public and call alerts remain independent of private decryption.
The existing classic worker build binds the SDK's import URL to its own URL.
Only `/sw.js` receives the same `wasm-unsafe-eval` permission already used by the
app and local `data:` notification images. Its network stays same-origin;
HTML, wallet entry, APIs and other workers keep their existing policies. No
`unsafe-eval`, inline script permission or new external origin is introduced.
Large private photos (over 128 KB) use the app icon rather than holding up the
notification with a full-resolution image. Smaller approved local profile photos
are passed as local data URLs, never via an unencrypted server/avatar endpoint.

Public post IDs are deduplicated in one bounded local record (32 IDs, session
digest only); author, message text, wallet and private peers are not persisted
there. Display does not mark a public post read. Public transaction wakeups and
in-app handle DM receipt remain independent of notification presentation.

The previous screen/controller hotspots receive only public entry-point wiring.
Headless device access, direct/group notification reading and worker presentation
are separate modules. Further hotspot cuts remain listed above. Background Web
Push delivery and existing private call controls are unchanged; the owner has
not selected the proposed per-device open/closed-app preference.

This correction stays on `codex/chat-preview-notifications`. The owner requires
branch names in English; this replaces the earlier Portuguese branch name. The
existing deployment command accepts the existing on-demand `check.yml` workflow
for the exact pushed task-branch commit; main still requires push-triggered CI.
The same repository, latest-run, SHA, branch, workflow and success checks remain.
This aligns the executor with the workflow's existing task-branch policy and
allows activation without merging this correction into main.

## Sender labels and unread timing — 20 October 2026

The owner reported a correct private photo/body with no sender name, and unread
badges/sound following the message preview. Private sender lookup now uses the
chat's encrypted local alias, then the verified profile card, then the name of
that one currently approved account. It never scans the contact directory or
sends a local alias to the backend. After confirming the updated app displays
the sender correctly, the owner requested removing the duplicate name from the
body on 20 October 2026. Direct-message notifications now put the sender only
in the native title and the message alone in the body, retaining the photo.

`messages/activity.ts` owns the coalesced, generation-checked unread projection
and sound. Live changes refresh counts before selected history; a completed
inbox page refreshes counts before its preview projection. Push settings,
presence and contact maintenance no longer precede this update. Counts remain
server-authorized; archive/mute still applies before sounding, and receipt does
not mark messages as read. System push sound and real-device timing still need
physical acceptance.

The screen receives only wiring; the existing screen/controller hotspot split
proposal remains above. Independent invitation rules and the required schema
review are in [Contact invitations](CONTACT_INVITATIONS.md).
