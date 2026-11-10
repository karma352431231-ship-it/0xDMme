# 0xDMme view-once send latency

## Decision for the implementing agent

Start with the view-once part uploader. The captured send spent 5.15 seconds uploading 23 parts one at a time. The ordinary attachment uploader already overlapped requests. A second opportunity is local preparation: four long tasks occupied the browser's main thread for 3.26 seconds before the first view-once part started. Investigate the first-check rendering path separately because the manual marker includes human reaction time.

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
- **Identify the case.** Let the operator select a fixed case label before file selection: text, ordinary image, view-once image, ordinary video or view-once video. Keep **Mark delay** as an end-of-send perception marker. Use fixed operation names for attachment reserve, part, finish, view-once create and view-once part when categorizing requests. Exclude filenames, bodies, message text and durable identifiers.
- **Get internal timestamps from the app.** The upload and publication owners should emit timings through the existing opt-in diagnostic bridge. The sender UI should emit the first accepted-check render for the same anonymous send slot. Record preparation, submit, publication acceptance, check render and manual marker separately. If the installed app lacks a stage, flag it as unavailable. The operator can still capture browser-visible timings.
- **Verify the recorder under the observed failure.** Interleave five sends with more than 1,500 background events. Check that all five summaries still distinguish acceptance, first check and manual marker, that overlapping parts count once in wall time, and that an interrupted send is reported as incomplete. Use the same revised meter and diagnostic hooks on both sides of the performance comparison.

## Implementation sequence

1. **Test bounded upload concurrency.** Inspect the client uploader and server write transaction together. Verify that parts can arrive out of order, that retries of the same index and ciphertext preserve integrity and quota accounting, and that publication requires a complete upload. If those contracts hold, try two concurrent part uploads inside the existing uploader. Reuse the ordinary uploader's scheduling logic only where the contracts match. Preserve ciphertext and part ordering in the completed object. On failure, stop scheduling new parts, settle or cancel in-flight work, and preserve the existing cleanup and retry rules. If the protocol requires sequential writes, measure the per-part server and network cost before proposing a protocol change.
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
Use the private chat for the five comparison cases. Select a fixed case and press **Start case before selecting file**, then send
once and press **Mark delay**. Start the next case only after marking the
previous one. Use a fresh capture after five cases. Network timings belong to
the selected case under this one-send-at-a-time procedure; HTTP success alone
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
