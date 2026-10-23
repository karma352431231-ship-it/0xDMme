# Hotspot refactoring from the current main branch

Base: `e18f644`. Branch: `codex/hotspot-refactors`. Requested sequence: H08,
H02, then H01 presentation. This branch is for review; merging into main and
VPS publication are outside this task.

The October 22 audit inspected an older checkout. The current main branch
already includes the app CSS split, post-thread rendering, message directory
and history owners, and other subsequent functionality. This work preserves
those changes and addresses the remaining responsibilities instead of applying
the old snapshot over them. Product flows, authorization, cryptographic formats,
storage identities, retention and public entry-point contracts must stay intact.

## H08: remaining global feature styles

The existing ordered app stylesheet remains the composition point, and theme
tokens stay in its existing `theme.css` owner. Vault usage/list presentation,
status display, chat layout and recovery text now live beside their features.
Shared card control defaults remain shared. The contact grid rule lives with
contact settings, after the general card grid. Phone search, conversation-row
and voice-dock overrides live with their components, after the corresponding
base rules. There is no new global override tail, specificity increase, literal
color, runtime state or application-logic change.

Validation: 19 affected appearance/layout/chat/settings tests; ESLint, strict
types, dependency boundaries, repository formatting and web build passed.
The pre-change characterization run also passed 44 tests, including discovery,
post-thread and message lifecycle coverage. The local browser is disabled in
Work settings, so the prepared synthetic before/after browser comparison could
not run. Visual equivalence across themes, breakpoints, focus and open/closed
states remains unverified; automated checks do not replace that evidence.

## Remaining authorized work

H02: separate post-card resources, isolated tag management and bounded post
list ownership; give discovery feed and ranking their own page state/lifetime.
Reuse the existing thread, snapshot, reply and feed-card modules.

H01 presentation: retain existing directory/history/synchronization owners;
extract the composer's independent draft, attachment and recording lifecycle.
Review remaining session scheduling against its existing owners. The message
engine, group administration and device authority are outside this scope.
