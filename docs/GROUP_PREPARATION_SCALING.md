# Group preparation at scale — design proposal

Status: **proposal, awaiting owner approval.** Nothing here is implemented.
Delivery, receipt and authorization behavior may change only after the owner
chooses an option. Base: `origin/main` `e072ae32`.

## 1. Problem

On every app start the inbox `groups` turn (`src/client/messages/inbox.ts` →
`GroupController.synchronizeAll` → `prefetchGroupPage` in
`src/client/groups/controller.ts`) walks **each group's whole history
backwards**, one 16-message page per vault turn, until the server answers that
nothing older exists.

The walk restarts on every load because the "prepared" flag lives only in
memory (`GroupMessageWindows.states`), and `restoreCheckpoint` in
`src/client/groups/message-windows.ts` always restores `prepared: false`. An
interrupted walk (app closed, tab reloaded) also restarts from the newest page.

### Measured (owner capture `diagLagCircle.json`, meter revision 15, 2 groups)

- 18 committed `groups` turns between 12.6 s and 35.1 s after start: **22.5 s**
  with the vault/authority lock almost always held. Sticker, settings and other
  vault work waits behind it.
- Each turn costs 1.1–1.5 s and makes **8 sequential requests** at about 130 ms
  each:

  | #   | Request                   | Purpose                                   | Per  |
  | --- | ------------------------- | ----------------------------------------- | ---- |
  | 1   | `devices/read`            | own authority for the vault turn          | turn |
  | 2   | `group-daily-states`      | daily state refresh inside the turn       | turn |
  | 3   | `group-history`           | governance verification of the group      | turn |
  | 4   | `group-message-delta`     | changes since the last confirmed revision | turn |
  | 5   | `group-message-recent`    | one 16-row page                           | page |
  | 6   | `group-message-received`  | delivery receipts for that page           | page |
  | 7   | `group-message-relations` | edits/reactions/pins of that page         | page |
  | 8   | `group-message-confirm`   | confirm the cut                           | turn |

  Five of the eight are fixed per-turn overhead; only three move the walk.
  Decryption (`receipt-verify`) is about 150 ms per page; the rest is network.

- Extrapolation: a group with 5,000 messages needs about 313 turns, roughly
  **6 minutes on every app start**, during which the vault is busy.

A second full walk exists. When the server's change journal cannot cover the
gap since the last confirmed revision (more than 256 changes, see
`066-group-message-changes.sql`, which prunes older rows), the relation/removal
index (`src/client/groups/message-index.ts`) restarts from sequence 0 with
`group-message-index`, again 16 rows per turn (`indexPages: 1`). A busy group
reaches 256 changes quickly, so a member who was away for a day pays both
walks.

### Private and public conversations already keep a marker

The problem is specific to groups. The other two conversation kinds already
persist their progress and read only what is new:

- Private conversations: `src/client/messages/sync-progress.ts` saves a sealed,
  account-wide journal cursor after every page (`saveSyncProgress`). In the
  same capture the `direct` turn took 259 ms, found nothing new and finished.
- Public `@` DMs: `src/client/social-dm/history-sync.ts` keeps a saved
  `DmHistoryCursor` and resumes from it.

Group preparation is the only path without one. Option A gives groups the same
model: a full first pass once per device (like a first history sync on a newly
linked device), then only what changed.

## 2. What group preparation is actually for

| Purpose                                                    | Where                                                                       | Needs every message?                                          | Needs only changes since the last run? |
| ---------------------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------- | -------------------------------------- |
| Directory preview (latest text)                            | `rememberPreview` on the first page                                         | No — latest window                                            | Yes                                    |
| Reopen checkpoint (instant reopen)                         | `saveCheckpoint`, `reopen:group`                                            | No — latest window                                            | Yes                                    |
| **Delivery receipts** (`group-message-received`)           | `GroupMessageLease.read`                                                    | No — only packets still pending for this account              | Yes, plus held items (below)           |
| **Local decrypted copy** (`GroupCache`, device-local)      | `readGroupRow` → `cache.put`                                                | Once per message per device — packets are immutable           | After the first full pass, yes         |
| Search across group history                                | `searchGroupCopies` reads the local copy                                    | Depends on the local copy being complete                      | —                                      |
| Offline / ex-member local copy                             | `openLocal`, approved rule "local copies already received are not recalled" | Same as the local copy                                        | —                                      |
| Relations (edits, reactions, pins)                         | `related()`, `preserveEdit`                                                 | No — new relations are new packets                            | Yes                                    |
| Removal index (author deletions applied to the local copy) | `GroupMessageIndex`, `applyGroupRemovals`                                   | Only when the journal has a gap                               | Yes, while the journal covers the gap  |
| Peer identity observations                                 | `identities.observedPacket`, `identities.save`                              | No — per new sender/packet                                    | Yes                                    |
| Media catalogue (gallery)                                  | `gallery-source.ts`                                                         | Not part of preparation; it has its own reader and checkpoint | —                                      |

Key facts behind this table:

- The server already knows exactly which packets are pending for each account
  (`group_packets.pending_accounts` / `received_accounts`). `received` is
  idempotent and account-wide: once any device acknowledges a packet, the other
  devices have nothing to acknowledge.
- A packet is never acknowledged while its media is unavailable
  (`!item.unavailableMedia.length` in `readGroupPage`). When the media becomes
  accepted, the `group_media` trigger writes a journal change, so the delta
  normally brings that packet back. After a journal gap it is found only by a
  walk.
- Packets are immutable. Re-reading an already cached page saves no work on the
  client (it hits `cachedGroupViews`) but still pays the network round trips,
  receipts and relations for it.

**Conclusion.** Only the local decrypted copy needs every message, and only
once per device. Everything else needs the latest window plus what changed. The
current design pays the "every message" cost on every start because it cannot
remember that the work was already done.

## 3. Constraints that every option keeps

- Every read stays verified: membership and governance (`group-history`), packet
  hash against the index, SDK/signature verification, and
  `group-message-confirm` before anything is shown.
- Confirmed windows and the reopen checkpoint stay bound to their full
  authorization scope (account, device, own directory, group head), as already
  required for confirmed progress (decision of 21/10/2026). The new preparation
  marker (Option A) describes the device's local copy, not a verified window,
  so it has the local copy's lifetime and is bound to the account, the group
  and this account's own participation period (section 4.1). Any mismatch,
  corruption or eviction is a safe miss that falls back to today's full
  verification.
- No decrypted content leaves the device. New persisted state contains only
  sequences, revisions and message ids, sealed in the existing local encrypted
  store.
- Interactive work (send, open, stickers, settings) keeps jumping the
  maintenance queue between turns; batching must not hold the lock longer when
  someone is waiting.
- Native apps run the same client bundle: client changes reach phones only
  after a native rebuild. Server changes must keep old operations working for
  installed builds.

## 4. Options

### Option A — remember preparation on the client (no server change)

1. **Persisted coverage per group.** A new owner module
   `src/client/groups/preparation-state.ts` keeps, per group, one sealed
   record next to the local copy, in the same device-local store and scope
   (`GroupCache`, `<account>:group:<group>`). It is bound to this account's
   own `joined` epoch, not to the group head (section 4.1):
   - `joined`: the participation period the coverage belongs to;
   - `revision`: the last confirmed message revision, used only as the change
     journal's starting point;
   - `high`: highest sequence up to which every readable packet was read,
     cached and acknowledged at a confirmed cut;
   - `low`: lowest sequence reached by the backfill, or `complete` when the
     server answered that nothing older exists;
   - `held`: at most 64 ids whose receipt is still owed because media was
     unavailable.

   `GroupMessageWindows` asks this module instead of its in-memory
   `prepared` flag; the prefetch advances it after each committed page. A
   miss means "nothing covered" and gives today's behavior.

2. **Warm start.** The existing checkpoint snapshot feeds `group-message-delta`;
   the delta's new packets are read, cached and acknowledged as today, `high`
   moves forward, and the group is done in **one turn**. An unchanged group
   costs one turn with no history read.
3. **Journal gap.** The removal index still needs its full metadata pass (only
   the server knows which old messages were deleted during the gap). The
   history read covers only the new part, forward from `high` with the existing
   `newer` history slice, instead of the whole history. `held` ids are
   re-checked with `group-message-objects`.
4. **Resumable backfill.** A device's first pass over an old group continues
   from `low` after a restart instead of starting again from the newest page.
5. **Several pages and groups per turn.** While
   `shouldYieldMaintenance` is false, one vault turn processes several pages
   (for example up to 4) and moves on to the next group, sharing the fixed
   overhead (`devices/read`, `group-daily-states`). Index pages use the same
   budget instead of `indexPages: 1`. It checks between pages and releases the
   lock as soon as interactive work is waiting.

Effect: warm start with the owner's 2 groups falls from about 20 turns and
22.5 s to about 2 turns (estimated about 1.5 s). A first pass over a
5,000-message group still reads every message once per device (needed for
search and the local copy), about 80 turns of about 2 s, but only once,
resumable and yielding. After a journal gap, the index pass remains
proportional to the group's size (metadata only).

Trade-offs: no server, API or migration change, so old native builds are
unaffected. The new record is an accelerator, but it makes a claim: "receipts
up to `high` were sent". If that claim were wrong, the failure would be a missed
receipt (the sender sees a single check), not a privacy or data-loss issue. The
media hole after a journal gap is covered only within the 64-id `held` budget.

#### 4.1 When the marker is kept and when it is lost

A first draft bound the marker to the group head, like `reopen:group`. Every
membership change (anyone joining or leaving, a role change) would then have
discarded it, and a large, active group would have fallen back to the full walk
again and again. The marker is therefore bound to what it actually describes:
the local copy, and this account's own participation period.

| Situation                                                            | Marker    | Why                                                                                                                                                                                                                                                                       |
| -------------------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Another member joins, leaves or is removed; a role changes           | kept      | Own `joined` epoch is unchanged. The new head is verified by governance as usual; the latest window is re-read and verified under it (one page); the removal index continues the change journal from the stored `revision`, which the server checks against the new head. |
| Own device added or removed, own directory changes                   | kept      | The local copy is not bound to the directory either. Every read keeps verifying the current directory.                                                                                                                                                                    |
| Browser or OS clears site data, storage eviction, private tab closed | lost      | The local copy is lost with it, so the full pass is genuinely needed again for search and offline reading.                                                                                                                                                                |
| New device or reinstalled app                                        | absent    | Each device builds its own local copy once. Receipts are account-wide, so there is nothing left to acknowledge.                                                                                                                                                           |
| Own reentry after leaving or removal                                 | reset     | A new `joined` epoch starts a new period without access to the gap. The old local copy stays, as the approved rule says.                                                                                                                                                  |
| Group deleted, account or session changed                            | discarded | Same lifecycle as the local copy.                                                                                                                                                                                                                                         |

The marker contains no content, only sequences, one revision and at most 64
message ids. It never replaces a verification: governance, packet hashes,
signatures and `group-message-confirm` still run on every read.

### Option B — A plus a server "pending for me" read (new API op, no migration)

Add a read-only operation, `group-message-pending`, scoped like the others
(group, head, finite cut, `after` cursor). It returns, in pages of 16 with the
usual page context, only the packets where this account is still in
`pending_accounts`, up to the cut's anchor. The client verifies and decrypts
them with the same reader and acknowledges them.

- Receipts become proportional to what is actually pending, independent of the
  history walk, journal gaps and held media. `held` is no longer needed.
- The local-copy backfill becomes pure background work at the lowest priority:
  it no longer delays anyone's check marks.
- Privacy: the server already stores these sets. The client learns only
  which of its own deliveries are pending. No new metadata is revealed.
- Cost: the query scans the group's rows by sequence
  (`group_packets_history` index). That is fine for thousands of rows. A
  partial index for very large groups would be a later, separate migration.
- Requires approval for the new server operation. Old builds keep using today's
  path.

### Option C — batched server reads (API changes)

Reduce round trips per page from 3 to 1, and index pages from 16 to about 256
rows:

- `group-message-recent` may return the page's relation ids inline (saves
  `group-message-relations`);
- receipts for the previous page ride on the next read (saves
  `group-message-received`);
- `group-message-index` accepts a larger metadata page (about 40 KB for 256
  rows).

This mainly speeds up the one-time backfill and the journal-gap index pass. It
changes several existing operations, needs versioned request shapes to keep old
builds working, and has the largest test surface.

### Option D — product change: stop the full local backfill

Keep only what was opened or scrolled, plus new deliveries, in the local copy.
This is cheapest, but search would cover only messages present on the device,
and an ex-member or offline user would keep less history. It changes approved
product behavior. Not recommended unless the owner wants that trade.

### Option E — make journal gaps rare (migration)

Raise the journal's retention from 256 to, for example, 4,096 changes per group
(change of the `record_group_message_change` trigger). Each row is charged 528
bytes to the group vault, about 2 MB per active group out of 2 GB. Gaps, and
with them the full index pass, become rare. Needs migration review and the
owner's agreement on the quota cost.

## 5. Comparison

|       | Server/API change  | Migration      | Warm start (2 groups)          | Backfill (5,000 msgs, once) | After a journal gap             | Risk            |
| ----- | ------------------ | -------------- | ------------------------------ | --------------------------- | ------------------------------- | --------------- |
| Today | —                  | —              | ~20 turns, 22.5 s, every start | every start                 | full index + full history       | —               |
| A     | none               | none           | ~2 turns                       | ~80 turns, once, resumable  | full index, new part of history | low             |
| A+B   | 1 new read op      | none           | ~2 turns                       | background, lowest priority | full index, receipts unaffected | low–medium      |
| A+B+C | several op changes | none           | ~2 turns                       | ~4× fewer round trips       | ~16× fewer index turns          | medium          |
| E     | none               | trigger change | —                              | —                           | gaps rare                       | low, quota cost |

## 6. Recommendation

1. **Phase 1 — Option A.** Client-only, no migration, removes the
   repeat-every-start cost that the capture shows. This is the change the owner
   will feel.
2. **Phase 2 — Option B.** Separates delivery from the backfill, so receipts
   scale with what is pending, not with group size. It needs approval of one
   new read operation.
3. **Phase 3, only if measurements still justify it — C and/or E** for the
   one-time backfill and journal-gap index cost on very large groups.

These are recommendations; nothing is approved.

## 7. Implementation plan (after approval)

Phase 1, in focused commits:

1. `preparation-state.ts`: sealed coverage record next to the local copy,
   bound to the account, group and own `joined` epoch; validation and safe
   miss. Unit tests cover the period mismatch, corruption and `held` budget.
2. `GroupMessageWindows` uses it: restore keeps coverage, the delta advances
   `high`, and a journal reset reads only forward from `high`. Extend
   `tests/group-message-windows.test.ts` and `tests/fixtures/group-preparation.ts`
   with: a warm start of a prepared group makes one history read; a restart in
   the middle resumes from `low`; a journal gap reads only new pages; held media
   receives its receipt when it becomes available; another member joining or
   leaving keeps the coverage and continues the change journal from the stored
   revision; own reentry starts a new period.
3. Prefetch batching with yield between pages and groups. Extend
   `tests/group-preparation-lifecycle.test.ts`: interactive demand releases the
   turn after the current page.
4. Measure with `npm run diagnostic:chat` (see `docs/CHAT_SYNC_DIAGNOSTICS.md`)
   on a cold start and a warm start, and compare the number and duration of
   `groups` turns with this capture.

Phase 2 adds the server operation with integration tests for authorization
(non-member, ex-member, outside the membership period), cut bounds and
pagination, then switches receipts to it with a fallback for servers without
the operation.
