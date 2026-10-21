# Media composition and app-tab continuity

## Owner request — 20 October 2026

- Public photos and uploaded GIFs follow their approved width/height ratio. The
  frame shrinks with a height-limited portrait instead of adding empty side bars.
  Landscape images remain responsive. The viewer still opens the whole image;
  existing upload optimization and server limits remain in force.
- Each selected post/reply file has a visible corner remove button, including
  composers mounted outside the app shell. GIF search links have individual
  removable draft previews and keep the existing external-media consent.
  Private/group/public-DM composers retain their existing remove controls.
- Switching app tabs retains the current Discover/Following page, filters,
  cursor and anchored position in this browser tab. One bounded feed page is
  retained for the visit, with media paused off screen and a background check on
  return. Explicit feed changes discard an incompatible page. Profile-only
  returns keep their existing ten-minute limit.
- The Contacts view retains its mounted controls and loaded data. Private chat
  directory previews survive app-tab navigation; returning checks only selected
  history instead of restarting the contact directory. The public DM directory
  also keeps its current rows while checking for updates on return. Authorization loss,
  session replacement, suspension and permanent departure keep their existing
  history gates. Session replacement discards retained presentation.

No decrypted content is added to persistent browser storage. A reload or the
mobile OS discarding the page still requires startup. Existing encrypted local
history remains owned by its original modules.

## Revisiting feed media and connected conversations — 20 October 2026

The owner requested that scrolling back to a loaded photo, uploaded GIF or video
reuse its source. Mounted media now retain their object URLs, and videos pause
off screen without resetting playback position. Inactive media share a least
recently visited RAM budget of 128 MiB and 48 files. Visible media are excluded
from that inactive budget so memory pressure does not interrupt playback; a
single approved video can be 100 MB. Actual decoded browser memory is separate.
Pressure evicts old inactive files, which may need another download. Disposing
the media mount or replacing a post releases its retained media immediately.
No disk cache, HTTP cache change, external GIF copy or retention rule is added.

The owner explicitly approved immediate reuse of a fully validated private
conversation during the same uninterrupted connected session, with background
updates. This supersedes the requirement to perform another online history
gate on every conversation switch for eligible retained windows. A remote
change not yet delivered may briefly remain in the displayed retained history.
First opens, session replacement, suspension, stream loss, removals and
authorization notices retain their blocking checks. This approval does not
authorize reuse across reconnects or persistent decrypted history.

Returning to the contact directory hides the selected projection without ending
that connected reuse epoch. Account suspension, stream loss and authorization
boundaries still invalidate it. A pending contact choice remains replaceable
and cancellable while the current maintenance owner finishes. Eligible memory
restoration then runs before entering the foreground synchronization state;
an unavailable window still uses the normal blocking verification path.

The `codex/chat-conversation-reuse` integration retains the current scheduler,
connected-epoch cache, removal gate and per-row media cleanup instead of
introducing a second cache or restoring the older screen coordinator. A live
change hint blocks navigation reuse until authenticated snapshot confirmation;
windows for a different snapshot are discarded. A same-session profile name or
revision change also invalidates reuse so an older profile is not reused on
navigation. Existing count, row and byte budgets remain unchanged.

Profile card bodies are excluded from the navigation cache. Each profile entry
retains its packet ID, hash, sender/peer, sequence and delivery metadata with an
empty text body; the complete verified card and photo remain in the existing
encrypted profile store. The cache therefore budgets actual message content and
profile verification metadata, rather than duplicate base64 photo bodies.
Original verified views are not mutated. Reopening still checks profile IDs and
hashes through the authenticated delivery/snapshot path, including rejection on
a mismatched profile hash. Profile changes, removals and session invalidation
keep their existing cache lifecycle.

Message row identity is owned by `messages/row-keys.ts`. Receipt-only updates
retain rows, while edits, deletions and changed reply excerpts update only the
affected presentation and release its media resources. The deleting tab alerts
other tabs without resetting its own in-flight deletion. All incoming branch
regressions use the current English-source presentation and lifecycle contracts.

## Attachment processing

The reported error comes from the worker error handler, rather than a rejection
of the allowed photo count. UI translations no longer load inside each
short-lived attachment worker; errors are translated by the main UI as before.
A startup/runtime worker error permits one fresh local attempt. A reported file
error or timeout is not retried, and no network upload is retried by this layer.
All attempts terminate their worker; the serial queue and its admission budget
remain unchanged. This improves handling of transient worker failures without
claiming that every device-specific failure has been reproduced.

## Validation and review boundaries

Regression tests cover the retained feed page/cursor/scroll, session cleanup,
chat-directory reuse, and bounded worker retries. The manual browser fixture
uses the real attachment worker and both forms with synthetic landscape,
portrait and square files. It verifies multiple uploads after individual
removal, GIF removal preserving the caption, and corner controls outside the app
shell. It never uploads to the live service or fetches external GIF bytes.

No dependency, database, migration, quota, cryptographic format, service unit or
infrastructure change is included. Deployment uses the existing staging command
from integrated, pushed code with passing exact-commit CI.

The existing `startMessages`, `startCommunities` and app coordinator remain
hotspots. New visit presentation and GIF drafts have dedicated modules. A
separate reviewed task should extract message lifecycle/navigation, community
route coordination, then app feature mounting, preserving their public
interfaces. The main risks are cancellation/session races; retain the existing
coordinator, discovery and browser lifecycle tests during that split.
