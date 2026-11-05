# Shared profile and emoji corrections — 2026-11-04

The owner requested these specific corrections on main and activation on the VPS,
excluding the unrelated native foundation and other uncommitted work.

## Approved behavior

- Public profile confirmation appears only while the editor has a changed draft.
  Reverting the draft hides it again; confirming an unchanged profile does nothing.
  External-media configuration remains in privacy settings and is removed from
  the public-profile editor. Existing consent enforcement remains in effect.
- On phone-sized conversations, the emoji/GIF panel occupies space below the
  composer and reduces the history area. It does not open a modal over the chat.
  Multiple emoji can be inserted without reopening the keyboard; the down arrow
  closes the panel and returns to typing. Leaving or disabling a composer closes
  its panel. Desktop selection and non-chat pickers retain modal presentation.
- The owner explicitly approved persistence of up to 32 unique recent Unicode
  emoji on this device. This supersedes the earlier session-only choice. The
  bounded local preference has no account, conversation, timestamp, network,
  synchronization or product-backup data. Unavailable storage falls back to
  session memory and reports that accurately. Clearing site/app data clears it.
- Community transfers are incoming offers to become the owner of a community.
  The directory and menu now explain ownership requests and their empty state.
- The shared viewport permits bottom safe-area painting. Native iPhone theme,
  status-bar contrast and viewport constraints are a separate local app update;
  native files and dependencies are excluded from this web release.

## Responsibility and verification

The existing profile editor owns draft visibility. The bounded recent-emoji
preference owns its storage and validation. Shared panel content owns rendering,
search and categories; the conversation dock owns caret insertion, focus and
its listeners/observer lifetime. Callers close that dock on conversation changes.
No backend, schema, dependency, authentication or wallet behavior changes here.

The source was checked with targeted regression tests and a synthetic browser
fixture covering profile draft visibility, dock layout, repeated insertion,
return to typing, recent emoji, GIF navigation and cleanup. The web build also
checks that the application imports the real shared emoji catalog. Publication
requires passing exact-commit CI and the existing deployment preservation checks.

Local release validation passed: ESLint, TypeScript, dependency boundaries,
formatting, English/Chinese localization coverage, the web build and 47 targeted
tests. The earlier shared-source browser fixture passed 15 interface assertions;
local browser automation was unavailable for a repeat on this isolated checkout.
The structural review retained separate owners for profile drafts, recent emoji,
shared rendering and dock cleanup. Native iPhone build 5 was installed separately;
physical keyboard/safe-area acceptance remains the owner's manual test.

The affected existing community refresh, DM coordinator and post-media tests also
passed (55 tests), with their DOM/picker doubles aligned to the current contract.

## Full phone conversation regression — 2026-11-04

Physical iPhone feedback showed that the earlier simplified fixture missed the
Communities frame around a handle conversation and its 420 px minimum height.
The frame retained global navigation; WebKit keyboard panning then displaced the
composer. The correction makes both private and handle conversations occupy the
visible phone viewport, hides unrelated shell navigation while a conversation is
open, and restores that navigation when the conversation leaves. The phone
viewport owner publishes visible height/offset only; the shell owns framing,
while the emoji dock retains selection/focus and cleanup ownership.

Native iPhone geometry follows UIKit's keyboard layout guide, with page-level
scroll disabled and existing inner history/page scrollers retained. Emoji panel
height follows its conversation, the return arrow is compact and generic form
styles no longer turn emoji search into an extra boxed field. Validation must
include the real shell and actual WKWebView layout, including short viewport,
keyboard opening/closing, repeated panel toggles and leaving the conversation.

The focused release set passed 81 tests covering viewport lifecycle, startup,
community refresh, DM composition, post media, emoji and web packaging. Lint,
types, dependency boundaries, formatting, localization and the web build passed.
The simulator compiled the native test target but failed to launch the app within
the bounded run; it is not reported as an iPhone visual pass. The owner also
requested complete removal of the native iPhone form/check toolbar. Its native
integration remains outside this shared browser release and has its own signed
app validation and installation evidence.

The later [mobile layout follow-up](MOBILE_LAYOUT_FOLLOWUP.md) removes the phone public-profile frames and updates account entry, wallet guidance and discovery filter placement.
