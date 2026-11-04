# Mobile conversation interactions — 2026-11-04

The owner requested touch actions, author-only batch deletion, corrected public
conversation navigation, scoped live search and stable keyboard handoff.
The owner explicitly chose deleting **their own messages for both participants**.
They also explicitly require that **public and private search never mix**.

## Responsibility and state

- `message-menu` owns bubble touch intent and anchored menus. Horizontal reply
  and stationary hold share one cancellable pointer lifecycle; vertical scroll,
  embedded controls and desktop input keep their behavior.
- `message-selection` owns checkboxes and confirmation for one displayed history.
  It receives author-deletion capabilities from each history owner, retains at
  most 64 selections, cancels without effects and reports partial failures.
- Private removal keeps its existing authenticated operation. The separate
  database social-deletion owner checks public author/device/target hash under
  both participant locks, replaces the accepted ciphertext with a compact signed
  confirmation, removes related ciphertext and schedules attachment reclamation
  in the same transaction. Per-owner charges never increase. Existing schemas,
  cryptographic primitives and quota/capacity checks are retained.
- The shared public-deletion contract uses the public profile's independent
  device history and existing signing primitive, never a wallet identity.
  Receiving checks the participant, author signature and target hash before
  storing an encrypted anti-resurrection flag and purging local content.
  The existing DM cursor advances to version 4 so version 3 clients replay signed
  deletions they could previously skip. Its key is preserved. Older clients keep
  reading ordinary messages without receiving an unknown marker format.
- `conversation-menu` owns shared directory menu presentation. `DmControls`
  coordinates distinct message/public blocks and encrypted public-DM preferences.
  Muting uses `public-dm:<profile>` entities in the existing preference format;
  it never invokes wallet-contact mute transport or changes message delivery.
  The current handle notification projection is its inbox badge. No native
  remote-push implementation is introduced by this change.
- Mobile routing normalizes public DMs before mounting and opens them in Chats.
  Paging and local copies remain reachable within the Public directory.
- Conversation search owns input, debounce, cancellation and bounded pagination.
  Private scope uses only private/group sources; Public scope uses only handle
  history. Changing scope clears query and results, and generation checks reject
  stale replies. Both families keep their separate storage indexes and identities.
  Results show avatars, matching text and the latest match per conversation.
  There is no submit, continue or separate open button. Query text stays local.
- The private reader and public DM depth owner retain a bounded window anchored
  at the selected result. A return control clears that anchor. The existing
  512-root window budget is retained; opening an old result does not require
  retaining every message between it and the present.
- The composer emoji owner hands its space to the keyboard and cleans up its
  temporary reservation on resize, replacement or a 500 ms deadline. Focus uses
  `preventScroll`; no system keyboard or viewport guess is introduced.

## Acceptance

Run focused gesture, scope isolation, deletion-signature/authorization/rollback,
quota, mute and cursor-replay regressions. Validate real CSS and touch behavior
in an assembled WebKit fixture. Build/sign/install the ordinary app with its
existing container preserved. Compilation and synthetic fixtures are not manual
acceptance of the owner's real conversations or wallets. Record exact passing CI,
source-scoped activation and physical checks separately.
