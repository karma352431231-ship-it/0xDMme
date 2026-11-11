# 0xDMme view-once send latency

Use [the updated implementation instructions](#updated-implementation-instructions-after-the-schema-2-capture) for the current action plan, including the confirmed global UI block. Earlier sections preserve prior investigations and implemented meter changes.

## Decision for the implementing agent

Start with the view-once part uploader. The captured send spent 5.15 seconds uploading 23 parts one at a time. The ordinary attachment uploader overlapped requests, but the later 409 capture below established that its server write lease does not support this safely. A second opportunity is local preparation: four long tasks occupied the browser's main thread for 3.26 seconds before the first view-once part started. Investigate the first-check rendering path separately because the manual marker includes human reaction time.

These are proposed changes. First locate the source revision matching the captured browser bundle, `app-f41f0d01ada79755.js`. The meter was built from `9797000c`. Its revision identifies the measuring tool only. Search the matching app source for `view-once-create`, `view-once-part`, `attachment-part` and the handler that reconciles an accepted send.

## What the browser measured

The sender clicked **Mark delay after the message appeared sent**. The capture ran for 102.26 seconds and retained the latest 1,500 events, dropping 1,259 earlier events. Three manual markers survived. Only the final two could be paired with a send click and a completed publication. The report identifies upload mode but omits file type and size. The text-only baseline and a matched image/video comparison require fresh captures.

| Elapsed wall time                          | Ordinary attachment | View-once attachment |
| ------------------------------------------ | ------------------: | -------------------: |
| Send click to first part start             |              1.47 s |               4.65 s |
| First part start to last part completion   |   2.25 s (13 parts) |    5.15 s (23 parts) |
| Last part completion to publish completion |              0.29 s |               0.19 s |
| **Send click to publish completion**       |          **4.01 s** |           **9.99 s** |
| Publish completion to manual marker        |              5.25 s |               5.38 s |
| **Send click to manual marker**            |          **9.27 s** |          **15.37 s** |

The upload row measures the wall-clock span across all parts. The ordinary upload includes overlapping requests. The publish operation itself took 154 ms and 191 ms respectively. The different part counts prevent a like-for-like estimate of the cost of view-once mode.

## Fix the console meter before collecting the baseline

- **Preserve the timings for each send.** In the console recorder (`src/tools/chat-diagnostics/recording.ts` in the meter revision), background traffic can evict the click and the manual marker from the 1,500-event buffer. Keep the detailed timeline bounded. Maintain a separate bounded summary for the five comparison sends, using anonymous slots local to the capture. Retain stage times, upload wall time, part count and peak in-flight parts. Report detail drops, summary overflow and missing stages explicitly.
- **Identify the case.** Identify each send automatically from the composer controls, selected files and local file inspection. Do not require the operator to choose a case or start each test. Keep **Mark delay** as an end-of-send perception marker. Use fixed operation names for attachment reserve, part, finish, view-once create and view-once part when categorizing requests. Exclude filenames, bodies, message text and durable identifiers.
- **Get internal timestamps from the app.** The upload and publication owners should emit timings through the existing opt-in diagnostic bridge. The sender UI should emit the first accepted-check render for the same anonymous send slot. Record preparation, submit, publication acceptance, check render and manual marker separately. If the installed app lacks a stage, flag it as unavailable. The operator can still capture browser-visible timings.
- **Verify the recorder under the observed failure.** Interleave five sends with more than 1,500 background events. Check that all five summaries still distinguish acceptance, first check and manual marker, that overlapping parts count once in wall time, and that an interrupted send is reported as incomplete. Use the same revised meter and diagnostic hooks on both sides of the performance comparison.

## Implementation sequence

1. **Test bounded upload concurrency.** Inspect the client uploader and server write transaction together. Verify that parts can arrive out of order, that retries of the same index and ciphertext preserve integrity and quota accounting, and that publication requires a complete upload. If those contracts hold, try two concurrent part uploads inside the existing uploader. The ordinary uploader's two-lane scheduler is now restricted to downloads after the 409 correction below; do not reuse it for writes without a verified server contract. Preserve ciphertext and part ordering in the completed object. On failure, stop scheduling new parts, settle or cancel in-flight work, and preserve the existing cleanup and retry rules. If the protocol requires sequential writes, measure the per-part server and network cost before proposing a protocol change.
2. **Attribute the main-thread work.** The four long tasks lasted 401, 900, 1,719 and 240 ms. Add local duration marks around existing media reads, conversions, encryption and serialization wherever the matching source performs them. Include the preparation that runs before the send click if file selection triggers work. Keep the marks in the existing diagnostic path and emit fixed stage names and durations only. If a full-file copy dominates, remove the redundant conversion. If a CPU-bound transform dominates, evaluate moving that operation to a worker using transferable buffers where ownership allows. Keep keys and plaintext on the client and preserve the existing cryptographic format. Remeasure after each change.
3. **Measure the first check and release the UI at the correct point.** Record separate local events when the client receives authoritative acceptance and when the first accepted check appears on the sender's message. The foreground operation ended about 3 seconds after publication in both sends. The trace shows follow-up synchronization during that interval, but cannot establish which operation gated the check. If the UI waits on unrelated sync and publish success already satisfies the app's acceptance contract, reconcile the pending message at acceptance. Keep receipt, backup and delivery work running under its existing lifecycle. A failed or ambiguous publication must retain its existing pending or failure state.

## How to verify the fix

- **Capture a baseline on the matching build.** Use the same sender, recipient, browser and network. Record one short report per send, starting before file selection and stopping just after the first check. Run text only, image with caption in both modes, and video with caption in both modes. Reuse the exact same file and caption within each pair. Record file size and mode separately. Verify that each report contains the send event and has zero dropped events.
- **Compare one change at a time.** Repeat matched cases on the candidate build, preferably three times per case. Report the median and range for click to acceptance and click to first check, plus upload wall time, peak simultaneous parts and longest main-thread task. A lower upload time should translate into a lower time to acceptance. Evaluate the first-check change against the UI event. Keep the manual marker as the sender's perception measurement.
- **Exercise the affected contract.** For concurrent uploads, force out-of-order completion and one failed part. Verify correct reassembly, no premature publish, safe retry with no double charge or duplicate message, and the existing single-view opening rule. For the UI change, verify accepted, failed and ambiguous responses and that a later sync reconciles the same message. Use the existing tests at the layer that owns each guarantee.
- **Roll out only the changes supported by the results.** Compare ordinary sends as a regression control. Include the before/after timings, browser and file sizes in the implementation report alongside the contract checks. Keep raw captures local.

## First implementation — 10 November 2026

The baseline is now reproducible: commit `55566ce6` builds exactly
`app-f41f0d01ada79755.js`. The older local main at `9797000c` identified
the meter, not the captured app. The changes below start from the matching app.

The concurrency prerequisite fails in the current protocol.
`ViewOnceStore.appendPart` accepts an append only at the current ciphertext
length and rejects a later offset with 409. An identical earlier segment is
idempotent, and the complete SHA-256 is required before publication, but these
guarantees do not make out-of-order writes valid. The existing two-lane
attachment scheduler therefore cannot be reused for view-once uploads. No
upload protocol, schema, chunk size, quota, ciphertext format or single-delivery
rule changes in this first implementation. The original capture measures the
serial request span; it does not isolate server transaction time from network
latency. Any protocol proposal needs that attribution and its own contract tests.

The revised console meter uses report schema 2. It retains five independently
bounded comparison summaries alongside the existing 1,500-event timeline.
Use the private chat for the five comparison cases. Send normally and press
**Mark delay** when each message appears sent. The meter creates summaries
on send gestures and associates earlier file preparation automatically; the
operator does not choose a category or press a start-case control. Use a fresh
capture after five sends. Network timings still require one send at a time.
HTTP success alone
is never reported as authoritative publication acceptance. Multiple message
slots in one case, overlapping cases, incomplete parts and overflow are explicit.

An updated app advertises send timing coverage through the existing local
opt-in bridge. The preparation and outbox owners emit fixed stage names and
durations, and the private/handle history owners mark the first connected,
visible DOM check after authoritative acceptance for that message. The marker
is not a pixel-paint timestamp or a recipient receipt; the pre-acceptance check
on an optimistic text bubble cannot satisfy it. Legacy app builds retain
browser-only capture and report internal stages as unavailable. Stage durations
include their existing IO/queue waits; nested stage durations must not be summed
as if they were independent CPU work. No file names, message text, keys,
payloads or durable IDs enter the diagnostic protocol.

This first implementation prepares the comparison and does not establish a
latency improvement. Collect the matching five-case baseline and candidate
captures before moving CPU work or changing when the UI reconciles acceptance.
Raw captures stay local. The implementation remains local until reviewed,
integrated and explicitly released through the existing deployment process.

Public text/view-once paths also emit the shared internal hooks. This comparison
does not claim full instrumentation of ordinary public attachments or groups.
The current change is the instrumented baseline for subsequent optimizations;
use these same hooks and meter on both sides of that comparison.

### Local validation and structural review

- Full lint passed, followed by targeted lint on the final diagnostic changes.
  Type checking, dependency boundaries and repository formatting checks passed.
- Targeted diagnostic and private/public send regressions passed, including
  lost publication responses, refused publication, retained drafts, FIFO and
  session invalidation. The new capture tests cover five summaries after
  timeline overflow, overlapping parts, missing/unfinished stages, an early
  perception marker, hidden history, old-build coverage and capture cleanup.
- Web, installed-product and console-meter builds passed. A packaged mobile
  web build does not establish acceptance on physical Android/iOS devices.
- The comparison owner retains at most five cases and 64 pending request
  correlations. The existing bridge owns its bounded per-capture message
  mappings and clears them on stop/deadline. Outboxes still own admission,
  crypto, retries and publication; history owners add one diagnostic call.
  No server, database, dependency or production deployment change is included.

Physical matched captures, server/network attribution, a reviewed upload
protocol proposal if needed, and any evidence-supported first-check or CPU
optimization remain pending. No before/after latency reduction is claimed.

## Automatic detection — owner correction on 10 November 2026

The owner rejected selecting a category before each test and explicitly allowed
local inspection of synthetic test files for the best automatic accuracy. This
supersedes the first implementation's manual case selector. The panel now has
only **Mark delay** and **Stop and download report**. Normal text submission,
file-input changes (including the existing drop path) and the composer's actual
view-once state identify the case. Enter, its generated button click and the
form submit share one gesture, so a message creates one summary. File selection
alone does not consume a comparison slot. Abandoned selections and clear-all
are handled without asking the operator to restart a case.

The local inspector reads files serially, detects supported format families from
signatures and compares their complete bytes with SHA-256. Hashes remain in a
bounded in-memory map and only anonymous per-capture file slots enter the report.
This identifies the exact same file across normal/view-once tests, even with an
empty or misleading MIME type. The report distinguishes signature detection,
MIME-only fallback, MIME mismatch, pending/unavailable inspection and unknown or
mixed selections. It records input byte sizes, not filenames or file contents.
A format signature is not proof that a decoder accepts the entire file.

Inspection permits at most 16 queued jobs, one active read, 16 MB per file and
five seconds per read, with at most 128 file fingerprints per capture. Stop
aborts the active read, rejects queued work and clears fingerprints. No file or
report is uploaded. Inspection duration is reported separately; its IO/CPU can
overlap the app's work, so it must not be subtracted blindly from send time.
The browser-only automatic workflow works on the currently published app;
internal acceptance/check timestamps still require the instrumented app build.

Automatic capture validation passed 26 distinct targeted tests across the
submission, file-inspection, per-send, existing network and reuse diagnostics.
Targeted lint, repository type checking, dependency boundaries, formatting and
the console bundle build passed. Structural review kept scalar composition
state in its observer, byte reads/hash slots/cancellation in the IO owner and
bounded summaries in the comparison owner. The application, server and
database are unchanged in this correction. Real-browser timing and the
instrumented app's publication remain separate pending work.

## Ordinary upload 409 correction — 10 November 2026

A subsequent 40-second browser capture, with zero dropped events, recorded two
HTTP 409 responses to ordinary attachment-part writes. JSON parsing succeeded.
Five part requests across the initial attempt and resumption produced three
successful responses and two conflicts, with no finish or publication for the
image within the capture. This supersedes the assumption that observing
overlapping ordinary requests established safe parallel upload support.

The matching client submitted two parts of one reference concurrently, while
AttachmentStore.begin grants one writer for the entire attachment and returns
409 while that writer is active. The lease spans object IO and finish across
separate short transactions. The client uploader now waits for each part's
storage confirmation before admitting the next write. Failure exits the upload
without finishing; resumption uses the existing received list and exact saved
ciphertext. Download concurrency remains two, with the existing bounded
settlement and offset-based assembly. No server, schema, crypto format, quota
rule, dependency or automatic mutation retry changes are needed.

The new public-client regressions reproduce Attachment busy with the old
uploader against a single-writer server adapter. They also exercise a response
lost after a stored part, skipping that part on retry, full ciphertext equality,
no premature finish, and concurrent downloads with original-offset assembly.
The real SDK encryption, hashes and local storage operations remain in these
tests; the network lease is an adapter, not a live database acceptance test.

Validation: all 18 targeted transfer, attachment and private send regressions
passed after the fix. Targeted lint, full type checking, dependency boundaries,
formatting, and web/installed-product builds passed. Structural review confirms
that upload sequencing remains in its existing owner, with no new state,
dependencies or server lease changes. Browser acceptance on the deployed build
is pending integration and publication.

## Updated implementation instructions after the schema 2 capture

This section supersedes the initial implementation order and its concurrency proposal. Source inspection used integration commit `8a0eb449`. Apply the work to the current integration branch in a separate worktree and reconcile changes made since that commit. The earlier sections retain the implementation and investigation history.

The owner requests a responsive chat throughout attachment sending in both ordinary and view-once modes. Prioritize independent draft interaction during transfer, release of send-related UI state at authoritative acceptance, and removal of post-publication maintenance from the send's foreground lifetime. Preserve engine serialization, durable drafts, account authorization and the existing upload protocol.

### Measured baseline

The schema 2 report retained five summaries with no summary overflow despite 1,048 dropped detailed events. The ordinary/view-once pairs have matching anonymous file slots and sizes. The image is 1,233,195 bytes and the video is 3,356,742 bytes. Only the view-once video has `ambiguous: false` and `complete: true`. Treat the other summaries as indicative until their association ambiguity is resolved. These are single samples.

| Case            | Click to acceptance | Acceptance to accepted check in DOM | Part upload wall time |
| --------------- | ------------------: | ----------------------------------: | --------------------: |
| Text            |            1,673 ms |                                8 ms |                     — |
| Ordinary image  |            3,229 ms |                            1,818 ms |    1,558 ms / 5 parts |
| View-once image |            4,813 ms |                               22 ms |    2,131 ms / 9 parts |
| Ordinary video  |            6,339 ms |                            1,843 ms |   4,257 ms / 13 parts |
| View-once video |           10,872 ms |                               10 ms |   5,455 ms / 23 parts |

The view-once video took 4,742 ms from submit to the beginning of the instrumented upload operation, 5,937 ms in that operation including creation/preparation, and about 194 ms from upload completion to acceptance. The part-only span is nested within the upload operation. Likewise, serialize/encrypt timings are nested in payload preparation. Avoid adding nested spans.

### Confirmed cause of broad UI blocking

The following references are repository-relative paths at the inspected commit. Function names identify the change sites even after line numbers move.

| Owner                                                                  | Current behavior and required intervention                                                                                                                                                                                                                                            |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/client/messages/index.ts`, submit event handler                   | Calls `queueText()`, then falls back to `run(submit)`. Attachments use the fallback and acquire the global foreground state.                                                                                                                                                          |
| `src/client/messages/synchronization.ts`, `MessageSynchronization.run` | Sets `busy = true` before waiting for active inbox/maintenance. It holds this state across the complete supplied operation. `finishRun` also awaits pending projection before clearing it. Keep serialization authoritative here, while exposing interaction availability separately. |
| `src/client/messages/index.ts`, `status`                               | Disables almost all buttons, inputs and selects in the mounted chat and directory whenever `busy` is true. Calls `menu.setBusy` with the same flag. Back and conversation buttons are exceptions. Replace this blanket presentation dependency with explicit action availability.     |
| `src/client/messages/composer.ts`, `update` and `voiceButtons`         | Uses `busy` to block attachment selection, recording and composer actions. Distinguish changing the next local draft from mutating the active send.                                                                                                                                   |
| `src/client/chat-ui/index.ts`, `updateChatComposer`                    | Keeps the textarea enabled except during recording, but disables attachment, emoji and view-once buttons through the blocked state. Text send has a queue-specific override. Preserve that existing typing behavior while extending independent draft actions.                        |
| `src/client/messages/index.ts`, `submit`                               | Awaits staging, pending rendering and `sendPending` for each selected file, then `synchronizeVisible`, then `markRead` or `dailyTick`. All remain inside the foreground operation.                                                                                                    |
| `src/client/messages/index.ts`, `dailyTick`                            | Awaits activity refresh, push settings refresh, daily configuration and heartbeat. These requests prolong the send-related busy interval. Schedule them through existing maintenance facilities.                                                                                      |
| `src/client/messages/outbox.ts`, `sendOne` and `notifyPublished`       | Publishes, emits acceptance, then retains local state and removes the outbox item. The published callback currently accepts only `kind === 'text'` without a relation. View-once uses that kind. Ordinary attachments miss this immediate callback.                                   |
| `src/client/messages/index.ts`, controller `published` callback        | Acknowledges the outgoing projection and rerenders history. Extend the projection contract to include staged attachments before broadening the callback.                                                                                                                              |
| `src/client/messages/visits.ts` and synchronization opening queue      | Conversation selection may be accepted while actual opening waits for engine ownership. Keep an already safe retained projection usable and preserve the existing queue for work requiring the engine.                                                                                |

In the trace, ordinary video was accepted at 57,327 ms, its check appeared at 59,170 ms, and foreground work ended at 60,247 ms. View-once video was accepted at 81,434 ms, its check appeared at 81,444 ms, and foreground work ended at 84,091 ms. Therefore acceptance-to-foreground-completion was about 2.9 and 2.7 seconds respectively. The actual controls can remain disabled through `finishRun`'s pending projection afterward.

This path contains local synchronization and maintenance after publication. It contains no explicit wait for the recipient to receive or read the message. The recipient opening the app can coincide with live updates, which needs a separate reproduction if the delay persists. Validate with the recipient offline.

### Change 1 — give the active send its own lifecycle

1. Introduce a cohesive attachment submission owner beside the existing message submission modules. It owns the immutable batch captured at submit, its destination, caption/reply, view-once mode, file order, stage/transfer/failure state and cleanup. Keep screen edits limited to wiring and rendering its state. Keep persistent outbox entries and retry ciphertext under `MessageOutbox`.
2. Replace `submit`'s iteration over mutable `composer.hasAttachment` and repeated reads of `selected` with a captured batch. The first item receives the caption/reply under the existing semantics. A conversation switch or a new selection must never change the destination or contents of a submitted batch. Preserve current file limits and bounded selection counts.
3. Transfer ownership of selected buffers/previews to the batch. After safe staging, clear only the matching draft generation and enable the next local draft. Retain or recover the failed draft on staging failure without overwriting anything typed since submit. Give transferred buffers, object URLs and cancellation explicit cleanup on failure, session change and disposal. Avoid keeping duplicate plaintext media for the entire upload.
4. Use the existing engine scheduler for durable writes and network sends. Keep one active mutation owner. Let users type, choose emoji, prepare a reply or select the next attachment while a transfer owns the engine. Gate destructive actions by their own conflicts and queue engine-dependent operations explicitly. An enabled action must either execute or enter a bounded queue with visible pending state. `run()` currently returns false when busy, so merely enabling its callers would silently drop actions.
5. Preserve the existing bounded text queue. Inspect `canQueueText`, `acceptsQueuedText` and `TextSendQueue` when transferring draft ownership so a leftover view-once toggle or the previous selection does not prevent the next eligible text from entering its queue. A second media submit must have an explicit bounded admission contract and stable ordering. Reuse existing persistent outbox limits and reject excess admissions visibly.
6. Separate transfer status from global synchronization. `renderUploadStatus` currently clears upload progress based on `synchronization.busy`. Bind progress to the batch lifecycle and attachment ID, with per-message pending/sending/accepted/failed projection. Release the accepted send's visible state when its authoritative publication succeeds. Keep required persistence cleanup under its owner until it finishes.
7. Move `synchronizeVisible`, pin persistence where required by that synchronization, and `dailyTick`/read follow-up to the existing scheduled follow-up owners. Preserve pin persistence required before publication in the outbox. Use the existing refresh/projection/maintenance APIs and ensure failures are reported and retried according to their established policy. Avoid detached unhandled promises.

### Change 2 — acknowledge ordinary attachments at publication

The ordinary send's delay before the check has a concrete asymmetry in `notifyPublished`. View-once entries have kind text, so they reach the immediate published callback. Ordinary attachment entries do not.

Extend the outgoing projection to represent an ordinary attachment from its safely staged metadata and local preview capability. Then extend the publication callback for those tracked attachments. Reconcile by stable message ID when verified history arrives, so the pending row becomes one accepted row. Dispose preview resources when that projection is replaced or removed. Keep acceptance, recipient delivery and read state separate. Failure or a lost publication response must retain the existing recovery/idempotency path.

A callback change alone is insufficient because the current outgoing acknowledgement path is designed for text. Review the outgoing text projection and pending render together and define a typed attachment projection contract in its owning module.

### Change 3 — remove expensive repeated work in view-once preparation

The inspected `src/client/view-once/index.ts` encodes media as base64 inside JSON. `sealViewOnceDraft` serializes that content, splits it into 64 KiB slices, base64-encodes each slice and calls `sealLocal` serially. `openViewOnceDraft` reverses that work and validates the assembled content. `prepareViewOnce` validates again, derives policy by decoding the file, encrypts the JSON, hashes ciphertext and wraps the key. `viewOnceDescriptor` decodes the file again to obtain its byte count. The shared `viewOnceContent` validator also decodes file data.

In the video sample, draft sealing took 893 ms, draft opening 913 ms and payload preparation 879 ms. Payload serialization took 10 ms and AES-GCM encryption 3 ms inside preparation. The 1,925 ms long task overlaps draft opening, preparation and descriptor creation. Small AES-GCM timing alone does not identify the cost of hashing, validation or key wrapping.

1. Add fixed timing spans for content validation, policy detection, ciphertext hashing, recovery-key wrapping and descriptor byte-count extraction. Use the existing diagnostic bridge and avoid payload logging.
2. Consolidate repeated validation/decoding within the same trusted preparation operation. Derive MIME/policy and input byte count once and pass validated metadata through a narrow internal contract. Keep validation at external and persisted-data boundaries.
3. Reduce redundant per-chunk conversions while preserving the existing encrypted draft format and recovery behavior. Inspect `src/client/message-storage/index.ts` before changing how local blocks are sealed. If a different stored or transmitted format is necessary, document versioning, old-entry recovery and compatibility as a separate decision.
4. Evaluate a worker for the identified CPU-heavy pure transforms if conversion improvements still leave long tasks. Define buffer ownership, cancellation and session invalidation. Avoid passing the whole authority object or SDK machine into a worker.
5. Remeasure click-to-acceptance and longest task. UI enablement alone cannot make clicks responsive while synchronous preparation occupies the main thread.

### Upload constraints that supersede the original proposal

Ordinary upload serialization was fixed in `8a0eb449` after HTTP 409 conflicts against the server's single-writer lease. View-once upload has another sequential contract: `uploadViewOnce` sends the current offset and requires the returned offset to equal that offset plus the uploaded length before advancing.

The part-count difference has an identifiable format cause. View-once encrypts JSON containing base64 media and uses 192 KiB chunks. A 3,356,742-byte file expands to roughly 4.48 MB of base64 content before metadata and encryption overhead, consistent with 23 chunks. Ordinary attachment transfer produced 13 parts. Measure ciphertext bytes and per-request wire bytes to quantify the remaining overhead.

Keep sequential writes while applying the frontend lifecycle and CPU changes. Concurrent writes or larger chunks require review of server admission, offset/retry semantics, body limits, quotas and deployed-client compatibility. The initial two-in-flight suggestion is superseded by these confirmed constraints.

### Regression and browser acceptance checklist

Extend existing tests at the owning layer, including `message-coordinator.test.ts`, `message-synchronization.test.ts`, `message-outbox-order.test.ts`, `outgoing-text.test.ts`, `view-once.test.ts`, `view-once-chat-recovery.test.ts` and `attachment-transfer.test.ts` as their contracts require.

- Hold an upload part unresolved. Verify that the next draft can be typed, emoji/reply/media selection can work, and queued actions have observable outcomes. Verify that the active file, caption, recipient and mode stay fixed.
- Change conversations and select another file during transfer. Verify that completion never clears or sends the new draft and that file ordering and destination remain correct.
- Hold post-publish history refresh and presence requests unresolved. The accepted row must show its first check and independent composer actions must remain usable.
- Keep the recipient offline through upload, publication and UI recovery. Confirm that acceptance and composer availability do not depend on a recipient delivery/read event.
- Exercise staging failure, a failed part, a response lost after publication, revocation, logout and disposal. Verify bounded queue admission, no duplicate publication, stable retry ciphertext, preserved recoverable drafts and cleanup of local preview resources.
- Preserve the single-writer transfer regression. For view-once, preserve existing encrypted drafts and single-view opening tests.
- Add per-send diagnostic events for staging completion, transfer completion, acceptance and UI availability, plus fixed blocking reasons. Fix schema 2 summary ambiguity before relying on the other four comparison cases. Report an absent render separately from an unaccepted send when the user switches chats.
- Repeat matched image/video captures with the recipient offline and online. Record before/after acceptance, check, UI availability, part upload and longest main-thread task. Use the repository's combined quality checks and relevant tests after the cohesive implementation.

The remaining screen-level coupling in `messages/index.ts` predates this task. Extract batch submission ownership first, then wire explicit availability and acceptance projection. Keep authority and history synchronization in their current owners. Structural completion requires that the new batch module owns its lifecycle through a narrow interface rather than receiving the screen's mutable state and callbacks wholesale.

### Implementation follow-up

- Private chat captures a fixed destination, mode, ordered selection and first caption/reply. At most two submissions can retain their transferred plaintext selections. Staging seals them into the existing ordered outbox and releases the plaintext buffers. A failed stage retains its own retryable draft; signing out or revoking the session cancels active preparation and clears those in-memory drafts.
- A staged attachment has a local ciphertext preview and its own progress. Server publication advances that row to the accepted check. Verified history replaces it by message ID and takes over subsequent delivery and read state. History, read and daily presence follow-up use scheduled maintenance.
- The local attachment worker performs view-once JSON and base64 transforms without vault authority. Old 64 KiB sealed draft blocks still open; new blocks use the same representation. Preparation reuses validated metadata for payload policy and descriptor byte count. Ordinary parts and view-once offsets still advance sequentially.
- Diagnostic comparison now reports stage/transfer completion, independent UI availability and accepted messages whose check was not observed. A missing manual perception marker does not make the next send ambiguous.
- The comparative browser capture remains to be repeated with the same files and an already authorized recipient, offline and online. No new latency figures are inferred from the regression tests.
