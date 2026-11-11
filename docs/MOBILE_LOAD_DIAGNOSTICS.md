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
The noisy timeline evicts oldest entries; a full milestone lane drops new entries
and reports the loss. Stop, expiry, document destruction and a new launch release
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
- `contacts`: Contacts page vault/permission/agenda loading through its next
  rendered frame. This operation starts when the page's load starts, while the
  native frame milestone measures elapsed activity time to the first result.
- `conversation-previews`: latest-message retrieval/verification, measured
  separately from the directory. Permission, vault and account read endpoints
  have fixed native request categories for status/header/body timing.

Returning from the background and opening conversations can also be measured
after capture starts. Time before `Activity.onCreate` and sender-to-recipient
latency across devices require separate instrumentation/clock correlation.

Compare the same media and record whether the conversation/media was already
cached. Use fresh copies for each view-once opening. Three attempts per case
provide a median and range without reusing consumed messages.

Instrumentation does not automatically open protected messages or change their
single-delivery contract. Content, names, account/device IDs, keys, cookies,
signatures and response bodies are excluded from the diagnostic export.
