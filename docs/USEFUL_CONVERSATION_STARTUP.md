# Useful conversation startup

The owner requested the shared directory corrections in the temporary startup
brief on 2026-11-13. Manual startup timing and physical-device acceptance belong
to the owner. This implementation introduces no new persistence policy, native
startup change, cryptography, API, migration or deployment.

## Workflow and ownership

The existing vault, contact-page and identity-pin prerequisites remain in
`messages/startup.ts`. Authorized contact rows still publish before pins finish;
histories, previews and group work retain their own verified prerequisites.

`messages/useful-startup.ts` owns one bounded visible-directory pass: private
previews followed by the verified group directory. It starts after the initial
directory/pin preparation, without any maintenance timer. The order avoids
putting group profile, invitation, outbox or daily maintenance before previews.
It does not enable concurrent SDK access. Existing authority turns still own
verification and serialized cryptographic state.

The startup owner retains a step when admission is unavailable, coalesces bursts
into one follow-up pass, cancels stale continuations by generation and resumes
after foreground work. It has no polling or automatic failure-retry loop. A
failed source does not suppress the other source. Hidden/disconnected documents,
selected-chat openings, sends, live connection preparation and urgent receiving
retain the synchronization owner's admission rules. An already admitted group
operation settles before the next foreground owner enters.

`MessageWarmup` retains its one-second optional scheduling and timer cleanup.
Speculative initialization, group maintenance, outbox flushing and daily work
run outside useful startup. They cannot hold its first publication behind an
unresolved unrelated operation. SDK preparation required by an actual read
remains inside that read's existing verified authority lifetime.

## Group directory and previews

`groups/directory-refresh.ts` reads at most 16 current summaries, verifies the
governance/head and profile using existing operations and saves the existing
encrypted catalog. `GroupController` owns pages, cursors, merging, selection and
one bounded page of deferred profile-maintenance IDs. It publishes the verified
directory before selected-history reconciliation, invitations, pending profile
publication and daily settings/counters. Deferred profile work reacquires current
authority and verifies the group again before mutation or history use.

Online startup reads the bounded catalog page after verifying the remote page.
Rebuilding the catalog from saved history runs after publication. Offline
startup and explicit pagination can import the saved catalog when needed.
Catalog entries use the existing read-only local-copy status. Account changes
cancel pending directory publication and maintenance.

`ConversationPreviewLoader` continues owning its memory-only projection,
single-flight/coalescing rules, selected-chat exclusion and revision fence. Its
startup preparation can await an already running/coalesced read. Rendering never
acknowledges a message as read. Both snapshot confirmations remain in their
existing positions. No persistent preview projection is introduced.

## Diagnostics and acceptance

The existing opt-in recorder adds `useful-directory` and `group-directory`.
The useful pass records admission wait and separate preview/group work stages;
`initial` distinguishes the first pass after session/reset from later passes.
Group and preview operations record verified row counts, including zero, DOM
publication and the next visible-frame opportunity. Hidden lists remain
incomplete until presented; failures and cancellation remain explicit.

`optional-maintenance` records its scheduler interval separately from work.
Existing authority diagnostics continue reporting queue/run durations. These
nested/overlapping spans must not be summed. A useful-pass completion is work
completion, not proof of physical pixels or completion of all background work.

All fields use fixed categories and anonymous counts/timings. Existing event and
operation limits, overflow reporting and capture cleanup remain unchanged. Native
metrics unavailable on a platform remain unavailable. No content is logged.

Android, iPhone/iOS and browser/PWA startup speed are **not manually tested** by
this implementation, as requested by the owner. No before/after latency claim is
made. The next owner-run capture should check first contact rows, group rows,
previews, empty/error states and foreground chat/sending behavior. Further
authority/snapshot reuse requires that evidence; no permission cache or removed
confirmation is part of this correction.
