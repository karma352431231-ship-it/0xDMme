# Mobile message loading diagnostics

The Android diagnostic APK enables Chrome inspection with the explicit Gradle
property `-PmobileDiagnostics=true`. Normal debug and release builds keep WebView
inspection disabled. USB inspection gives the authorized Mac access to the app's
WebViews, including the protected viewer. Use the diagnostic package for this
explicit investigation.

The existing local console recorder captures automatic history, ordinary media
and view-once stages. There is no file-type selector. Reports contain anonymous
capture slots, fixed operation names, statuses, byte counts and durations.
Capture is local, opt-in, bounded to ten minutes and has no automatic upload.

## Capture from the Mac

1. Connect the Android device by USB and authorize the Mac.
2. Open the installed diagnostic app. In Chrome on the Mac, visit
   `chrome://inspect/#devices` and inspect the app's main `https://localhost`
   WebView.
3. In the repository, run `npm run diagnostic:chat`, then
   `pbcopy < build/chat-lag-console.js`.
4. Paste into that WebView's DevTools Console and execute once. Capture begins
   immediately. Keep the document open while reproducing the delay.
5. Open a conversation, load ordinary media, and open new view-once messages.
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

This console capture starts after installation of the recorder in the running
document. It cannot reconstruct process launch before capture. Returning from
the background and opening conversations can be measured after capture starts.
Sender-to-recipient latency across devices requires separate clock correlation.

Compare the same media and record whether the conversation/media was already
cached. Use fresh copies for each view-once opening. Three attempts per case
provide a median and range without reusing consumed messages.

Instrumentation does not automatically open protected messages or change their
single-delivery contract. Content, names, account/device IDs, keys, cookies,
signatures and response bodies are excluded from the diagnostic export.
