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
