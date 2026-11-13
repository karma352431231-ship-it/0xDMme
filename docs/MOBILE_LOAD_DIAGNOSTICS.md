# Mobile message loading diagnostics

The Android diagnostic APK enables Chrome inspection with the explicit Gradle
property `-PmobileDiagnostics=true`. Normal debug and release builds keep WebView
inspection disabled. USB inspection gives the authorized Mac access to the app's
WebViews, including the protected viewer. Use the diagnostic package for this
explicit investigation.

The local console recorder captures automatic app startup, session/profile
restoration, contacts, conversation lists/previews, history, ordinary media and
view-once stages. There is no file-type selector. Reports contain anonymous
capture slots, fixed operation names, statuses, byte counts and durations.
Capture is local, bounded to ten minutes and has no automatic upload. The explicit
diagnostic APK starts a content-free in-memory launch capture automatically.
Normal builds still require the console recorder and retain no launch history.

## Capture from the Mac

1. Connect the Android device by USB and authorize the Mac.
2. Close and reopen the installed diagnostic app to record a fresh launch. In Chrome on the Mac, visit
   `chrome://inspect/#devices` and inspect the app's main `https://localhost`
   WebView.
3. In the repository, run `npm run diagnostic:chat`, then
   `pbcopy < build/chat-lag-console.js`.
4. Paste into that WebView's DevTools Console and execute once. The diagnostic APK replays its retained launch metadata, then continues the same
   capture, including operations still in flight. Keep the document open while
   reproducing the delay. Attach within ten minutes of opening the app.
5. Visit Contacts and Conversations, open a conversation, load ordinary media,
   and open new view-once messages.
   The existing sender measurements continue working in the same capture.
6. In the Mac's DevTools Console, export to the Mac clipboard:

   ```js
   copy(JSON.stringify(window.__0xdmmeLag.stop(), null, 2));
   ```

The mobile overlay's Stop capture button ends collection. Export through the
Mac Console afterward. It does not depend on the app supporting a Blob download.
Pasting the recorder again starts a fresh capture after the previous one stops.

## Reading the report

- `loading.operations` retains up to 64 operation summaries independently of the
  1,500-event detailed timeline. Overflow, incomplete operations, failed and
  cancelled attempts are explicit.
- A history attempt starts when the conversation is requested, including any
  wait for engine ownership. Verified rows, DOM insertion and a visible frame
  opportunity are recorded separately.
- Ordinary media records the load, ciphertext retrieval, decryption and decoded
  media readiness. Native request entries distinguish headers, complete bodies,
  HTTP status and transport failures. Historical media may lack detailed
  retrieval/decrypt stages; its outer loading/presentation is still measured.
- View-once timing starts at the person's opening action. Download, decryption,
  transfer into the native viewer, native show and draw/video frame are separate.
  The native frame reply is bounded and metadata-only. Unsupported builds,
  timeouts and missing frames are reported rather than treated as visible content.
- `nativeRequests` aggregates counts, bytes, statuses and durations by fixed
  category, preserving failures when detail events are evicted. Native transport
  durations include the guarded bridge and the application's body-read demand.
- Native draw duration uses Android's monotonic clock relative to native show.
  The total operation duration observes that event after its bridge reply.
  DOM frame opportunities and native draw/video callbacks are presentation
  milestones, not proof of the physical screen's exact display time.

## Startup and directory measurements

The owner requested startup and contacts/conversation loading coverage on
2026-11-11. The diagnostic APK arms capture after its guarded native connection
is ready and before the application modules are imported. JavaScript startup
elapsed time is relative to the document's performance clock. Android measures
from `Activity.onCreate` through WebView setup, committed navigation and the
first reported shell/contact/conversation frame. Native totals include the
bounded bridge notification delay; they are not the OS launcher tap or physical
screen display time. Reloading the document restarts the JavaScript clock but
retains the activity clock: navigation start and commit offsets distinguish it
from a new activity. Reopen the activity for comparable fresh launches.

`loading.startup` identifies early coverage and dropped early events and contains
Android activity-relative milestones. Negative timeline `ms` values precede Mac
console installation; operation stage times remain relative to that operation.
The launch buffer has two lanes: 512 startup milestones and 988 other events.
Both lanes retain their first entries and report newly dropped events when full.
The exported `loading.startup.details` keeps the same bounded launch evidence
independently of the rolling main timeline, plus later startup/contact milestones. Stop, expiry, document destruction and a new launch release
the buffer. Early long-task entries are included where WebView supports them.
No content, identifiers or response bodies are retained by this buffer.

- `app-startup`: document/entry, native bridge ready, app module load and shell
  frame opportunity. This is separate from account/directory readiness.
- `account-restore` and `private-profile`: session request, device keys, encrypted
  profile request and profile decryption. Signed-out/locked states are explicit.
- `directory-startup`: verified vault, directory, runtime preparation and identity
  pins. Parallel stage durations overlap and must not be added together. Repeated
  stages retain a count and cumulative duration, so a multi-page vault load is
  not reduced to its last page.
- `conversation-list`: agenda, approved permissions, archived peers, local
  identities and the loaded list's DOM/frame. A loading placeholder does not
  complete it. Empty loaded lists are valid. Hidden lists remain incomplete
  until presented; there is no claim that every avatar is ready.
- `contacts-screen`: the Contacts page DOM/frame before loading finishes,
  distinct from the `contacts-screen-frame` Android milestone and the loaded data.
- `contacts`: Contacts page vault/permission/agenda loading through its next
  rendered frame. This operation starts when the page's load starts, while the
  native frame milestone measures elapsed activity time to the first result.
- `conversation-previews`: latest-message retrieval/verification, measured
  separately from the directory. Permission, vault and account read endpoints
  have fixed native request categories for status/header/body timing.
- `group-directory`: verified group summaries, including an empty page, through
  DOM publication and a visible-frame opportunity. Invitations, pending profile
  publications and selected-history maintenance are outside this operation.
- `useful-directory`: the bounded preview/group startup workflow, separate from
  all-background-work completion. `initial` identifies its first pass after a
  session/reset. Admission wait, preview work and group work are separate stages.
- `optional-maintenance`: deliberate scheduler interval and admitted work,
  retained outside the critical path of useful directory startup.

Preview operations now include verified row counts and DOM/frame opportunities;
completion no longer means only that the network/verification read returned.
Hidden lists remain incomplete until presented. See
[useful conversation startup](USEFUL_CONVERSATION_STARTUP.md) for ownership and
the owner-run physical acceptance scope.

Returning from the background and opening conversations can also be measured
after capture starts. Time before `Activity.onCreate` and sender-to-recipient
latency across devices require separate instrumentation/clock correlation.

Compare the same media and record whether the conversation/media was already
cached. Use fresh copies for each view-once opening. Three attempts per case
provide a median and range without reusing consumed messages.

Instrumentation does not automatically open protected messages or change their
single-delivery contract. Content, names, account/device IDs, keys, cookies,
signatures and response bodies are excluded from the diagnostic export.

## Detailed transport, crypto and viewer timings

The owner requested these cuts on 2026-11-11. All fields remain fixed metadata.
Native timing aggregates survive detailed timeline eviction in `nativeRequests`:

- `nativeReceiveUs`: Android `execute()` until response headers plus cumulative
  socket body-read durations. Demand-driven body reads include waits for data;
  bytes buffered before a read are not independently timestamped on arrival.
- `nativeEncodeUs`: Android base64 serialization; `nativeWireUs`: JavaScript
  parsing of the bridge envelope; `nativeDecodeUs`: response chunk base64 checks
  and binary conversion. `nativeBridgeUs` is the encompassing bridge roundtrip;
  `nativeBridgeOnlyUs` subtracts those measured components and is an approximate
  residual for queues, scheduling, serialization and crossing the bridge.
- `nativeBodyReadUs`: application body assembly/UTF-8 read via Response.text;
  `nativeJsonParseUs`: JSON.parse separately, including failed parses.
  Encompassing spans overlap: do not sum them as independent durations.
- Values ending in `Us` are integer microseconds; `counts` reports read blocks
  and native samples. Old native builds omit native receive/encoding metadata.

View-once `decrypt` now contains header verification, `decrypt-base64`,
`decrypt-integrity`, `decrypt-key` (recovery, unwrap and import), `decrypt-aes`,
UTF-8 decoding, plaintext JSON parsing and `decrypt-validate`. Validation includes
its existing file base64 decode, which is also measured as a nested base64 span.
Normal attachment crypto in the worker exposes integrity, runtime, the maintained
Matrix `decrypt-sdk` operation and image validation. The SDK does not expose its
internal key/AES phases; the report does not invent that separation or replace
its cryptography. Historical archived media and private-profile decrypt spans
retain their existing outer coverage.

`native-payload-decode` precedes transfer. Each 64 KiB viewer block records its
base64 conversion separately from `native-append`. `native-transfer` encompasses
the operation and records planned bytes/blocks and acknowledged bytes/blocks.
Partial failure preserves the last successful acknowledgement. The temporary
binary copy is wiped on both success and failure; no viewer input is exported.

## Startup collector revision 4

Build the collector with the same reviewed source commit as the diagnostic APK.
Reports now include collectorCommit and collectorDirty alongside meterRevision 4.
The groupStartupKinds field lists useful-directory, group-directory and
group-previews. Each group preview keeps one operation across bounded index turns,
with verified, published, DOM and frame stages when the row is actually presented.
Missing or dropped events still require checking capture coverage and overflow.
Available document-response and script-response resource durations complement the
entry, bridge-ready and modules stages. They do not isolate CPU evaluation or
measure time before Activity.onCreate.

## Group directory pre-list attribution, collector revision 5

The requested window starts at group-directory start and ends at the first
client transport dispatch of group-list. The installed app and collector both
need this instrumentation. An older app produces explicit missing-clock or
not-dispatched coverage, while collector revision 5 preserves the new fields.
Collector commit and dirty state continue identifying the exact console build.

Each group-directory operation records identities-start/end, vault-request,
vault-acquired, vault-ready, group-mode-start/end and group-list-send. Every
point uses the document's performance.now clock and the same anonymous load
slot. Vault-acquired is actual entry to the exclusive authority turn. Vault-ready
follows device/directory/key preparation and the group authority checks. Group-mode
covers signing, transport, response/body decoding and its existing API guards.
Group-list-send marks client transport dispatch after signing. It does not measure
when a native socket first sends bytes.

The load capability stays in process. Identity loading and directory authority
requests carry it into the existing authority queue without changing admission,
priority, fairness, retries, authorization or persistence. Authority phases carry
that load slot, a capture-local anonymous queue slot and workClockMs from the same
performance clock. Capabilities and timing fields never enter API payloads.
The first group-list dispatch closes the pre-list capability. Later group/profile
turns cannot add pre-list work to it. Stop, expiry and capture replacement also
invalidate capabilities.

Read loading.operations[].preList on the group-directory summary. Milestones and
interval endpoints are relative to that operation's start. The existing startedMs
places it on the capture timeline, including negative early-startup values.

- durationsMs reports identity loading, linked vault queue, linked vault execution,
  authority preparation, group-mode and preparation of the first group-list request.
- intervals and overlaps retain which stages overlap. Identity loading can contain
  its own vault waits. Group-mode and signing can run inside vault execution.
  These stage durations must not be added together.
- accounting partitions the pre-list wall time into queueMs, executionMs and
  unattributedMs. Queue intervals are unioned first. Execution is covered stage
  wall time outside explicitly linked vault queue waits and includes I/O and
  dependency waits within observed stages. It is not CPU time. The uncovered
  remainder is reported with explicit unattributedIntervals.
- work preserves queued/admitted/acquired/finished points for linked requests.
  Scheduler wait and native admission wait remain separate. Occupant categories
  come from the overlap of observed holder execution with that wait in the same
  anonymous authority queue. They are never inferred from a nearby unlinked
  request. Replaced occupants produce separate category durations.
- An unobserved holder, another document's native lock owner or missing boundaries
  remain unobserved. Contradictory overlapping holders are ambiguous. Generic
  vault is a valid fixed category when an existing caller has no finer label.
- coverage reports missing milestones, milestone overflow and authority-summary
  overflow. Missing evidence does not establish a zero queue wait or completion.

The existing ten-minute duration, 1,500-event timeline, 512/988 early lanes,
64 load summaries, 512 authority summaries and eight points per authority work
stay bounded. Each existing group-directory load slot retains at most 32 pre-list
milestones. Linked authority points share the existing startup milestone lane.
Anonymous counts, categories and timings are retained, with no automatic upload.

The synthetic source-wiring regression reproduces a 2,550 ms interval, including
700 ms of identity work, an explicitly linked 1,170 ms vault wait, 380 ms of
verified-authority preparation, 200 ms of group-mode and 100 ms of request
preparation. Separate aggregation tests reject attribution of an unrelated
1,170 ms wait and retain missing/overlapping evidence. These are test inputs;
they do not establish the cause of the owner's earlier 7.06-to-9.61-second capture.
