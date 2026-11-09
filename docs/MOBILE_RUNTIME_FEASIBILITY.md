# 0xDMme installed-app runtime feasibility

Updated: 2026-11-02. Local engineering work; no native device acceptance, store
enrollment, release signing, license adoption or VPS activation is implied.

## Runtime and project ownership

Capacitor **8.6.0** is selected for the local feasibility build. The exact core,
CLI, Android and iOS npm packages deliver MIT notices; the CLI supports Node 22+
and was used with the project's Node 24.14.0. Versions and integrity are fixed
in the existing npm lockfile. No second package manager or paid build service is
introduced. This is a feasibility selection, not closure of full feature parity.

The resolved CLI tree includes `big-integer@1.6.52` and `stream-buffers@2.2.0`
under Unlicense. Their delivered texts were reviewed. The existing license gate
admits only those exact Unlicense versions; unknown terms and other versions
remain blocked. Existing GPL authored-code and third-party obligations remain
effective. Native Swift/Gradle dependency inventories, release notices and final
source delivery still need their own complete review before distribution.

- `capacitor.config.ts` owns the local shell configuration. The development
  identifier `app.zeroxdmme.development` is not a store registration or publisher
  choice. The display name is 0xDMme.
- `mobile/android/` and `mobile/ios/` own native project configuration. iOS uses
  Swift Package Manager with the exact Capacitor version. No signing credentials
  or machine-specific SDK paths belong in Git.
- `src/tools/build-mobile.ts` now owns the complete product in `dist/mobile/`,
  with a hash manifest, 96 MiB build budget and refusal of unexpected entries.
  `frontend-assets.ts` owns shared UI compilation/source inventory; web/native
  publishers retain their own outputs. The former five-asset, 16 MiB lab builder
  is preserved as `build-mobile-feasibility.ts` → `dist/mobile-feasibility/`.
  Neither builder activates a release or downloads app code.
- `src/client/mobile-feasibility/` owns an explicitly triggered synthetic
  encryption/storage experiment. Its own database contains one fixture, expires
  after 30 minutes, and supports explicit clearing. Expired or invalid data
  fails rather than silently becoming a successful new persistence result.
  Transactions close their database, abort on cancellation/failure and have a
  five-second deadline. UI operations have a 30-second deadline and are cancelled
  on suspension. No account database, wallet or backend is accessed.
- Native SDK imports are restricted to the native feasibility entry by
  dependency-cruiser and its existing quality-gate tests. Domain modules consume
  ordinary browser-safe contracts rather than Capacitor objects.

The generated native projects retain development template icons. Replace them
with the existing product assets before beta preparation; template generation
does not establish release identity, platform appearance or store readiness.
Android automatic backup and transfer configuration is disabled for this shell.
Backup/secret-custody implementation and OS lifecycle acceptance remain part of
O05 before real account use. iOS Complete protection/exclusions and device-only
Keychain policies now have compile evidence; this does not establish device
acceptance. See the native API contract and incremental flow matrix.

## Service identity versus document origin

The installed assets use `capacitor://localhost` on iOS and `https://localhost`
on Android. These are storage/asset origins, not new account identities.

`src/client/application-origin/` owns the service identity used by wallet recovery,
wallet approval destinations, public invitations and representative credentials.
Web builds retain `location.origin`, including isolated development. The
installed build fixes the service identity to `https://0xdmme.app` at build time.
URL parameters, bridge messages and mutable runtime settings cannot select it.

Only callers creating or checking that identity use the new contract. PWA caches,
local notification preferences, asset URLs and browser storage continue to use
their document origin. No signature message, AAD, cookie name, database name,
recovery format or existing record is migrated. Existing recovery configurations
must verify against the same service origin on both mobile OSes.

## Native API/session contract

The production web client uses relative API URLs, HttpOnly/SameSite cookies,
CSRF validation, explicit server-origin admission and abortable streaming fetch
for live messages. The server admission policy remains unchanged in this work.

The [client transport adapter](MOBILE_API_TRANSPORT.md) now preserves those authorization properties at its JavaScript boundary. Android/iOS HTTPS and private-cookie owners are now implemented locally; Android
has limited observed native session/custody results, while iPhone source compiles
and current simulator execution is blocked. Full native acceptance remains open. A native owner must retain the existing per-operation budgets, cancellation and streaming behavior. It must
keep session/challenge/handoff cookies private, enforce the fixed TLS destination,
refuse redirects outside the reviewed contract, and reject requests from foreign
frames or navigated documents. Cookie values must not become JavaScript return
values, logs, telemetry, links or backup exports. Define durable secret storage,
logout, revocation, reinstall, update and OS backup behavior before real accounts.

The built-in HTTP plugin exposes a completed response API. Its documented fetch
patch is not evidence that the existing SSE stream or cancellation lifecycle
works. The cookie plugin's `enabled` flag controls patching, not a proof that
every native cookie method is inaccessible. Do not put product session cookies
in a shared jar merely because patching is disabled. Review an explicit native
adapter and its cookie ownership before integration; do not broadly enable CORS,
weaken CSRF or expose tokens as a shortcut.

The feasibility CSP allows local resources only. `server.url`, mixed content,
wildcard navigation and global HTTP/cookie patching are absent or disabled.
This shell intentionally does not load the working account UI until its transport
and storage prerequisites are implemented. It is not a reduced mobile release.

## Running and interpreting the experiment

Use the project's Node/npm versions and `npm ci --ignore-scripts` first.

```sh
npm run mobile:build
npm run mobile:sync
# Separate historical crypto/storage experiment (not the default native entry):
npm run mobile:feasibility:build
```

Open the generated Android/iOS project using its supported IDE. Run **Run local
checks**, restart the app, then run it again. The experiment checks Web Locks,
structured cloning of nonextractable signing/wrapping keys, existing device-key
verification, and encryption/decryption through the existing Matrix WASM attachment
adapter. Reopening verifies the stored fixture rather than generating another key.
**Clear test fixture** removes only that synthetic record.

A browser preview is useful for assembled-resource and persistence failures but
does not establish WKWebView/Android WebView support, OS restart durability,
wallet return, account recovery, message exchange, push, media, calls or updates.
Use synthetic accounts/content in the next integration slice; preserve full web
feature/wallet parity and record actual results for both OSes.

Use platform toolchains compatible with the declared Capacitor version. Native
compilation has now passed through Xcode for iOS and the project's Gradle wrapper
with a standalone Android SDK/JDK for Android. Android Studio is an optional IDE
for this command-line workflow. Exact host/toolchain versions, installation
receipts, artifacts and device inventory remain exclusively in `.local/`.

## Evidence and next work

Project generation, local asset preparation and native synchronization succeeded. The complete `npm run check` passed: 493 application, 164 deployment and 16 evaluation tests, in addition to lint, types, boundaries, licenses, formatting and all three builds. Copied native assets match the build manifest; Android XML is well formed.

The browser experiment created a fixture, reopened and verified the stored nonextractable keys/ciphertext after reload, and cleared the record. This is assembled browser evidence only. Structural review confirmed that identity consumers retain domain/state ownership, the origin contract is immutable, and the synthetic store/UI/build each own their resources. Native compilation has since passed for both platforms; physical acceptance remains pending. See the [living handoff](MOBILE_APP_DECISIONS_AND_PLAN.md) for the baseline and remaining work.

The 2026-11-02 native compilation check produced an Android debug APK and an
unsigned iOS device build from the existing feasibility projects. The Android APK
passed signature verification; all five embedded feasibility assets in both
products match the mobile build manifest. The iOS bundle retains the development
identifier, packaged local assets and disabled global HTTP/cookie patching. The
generated Swift resolution record pins the already-declared Capacitor 8.6.0.

These compilation/package checks did not establish runtime behavior. The iOS
device product needs development signing before installation. Native distribution/
license review and physical acceptance remain open.

## Native runtime tests

The Android instrumentation test now passes inside the packaged app's real
WebView. Its self-contained run creates/verifies the synthetic fixture, recreates
the native activity/WebView, requires reopening the stored fixture and clears it.
A separate host-controlled workflow creates it, force-stops the app, confirms no
target process survives, then requires successful reopening and cleanup in a new
process. All three instrumentation invocations passed. This exercises Web Locks,
nonextractable WebCrypto device keys and the existing Matrix WASM encryption.
See the [Android test instructions](../mobile/android/README.md).

The separate iOS UI-test target/scheme also passed the synthetic workflow in
WKWebView: creation, verified app termination, relaunch, reopening the stored
fixture and cleanup. One UI test passed, including a captured restored-fixture
result. Initial attempts encountered simulator migration and cold-WebKit startup
delays; the native page was observed loading after the original readiness wait.
Only startup readiness was extended to 120 seconds; fixture-operation waits
remain 35 seconds. See the [iOS test instructions](../mobile/ios/README.md). Exact
runtime versions, logs, images and result bundles remain in `.local/`.

Both native harnesses are explicit platform tests, separate from `npm run check`.
They use the existing AndroidX dependencies and platform XCTest frameworks.
Structural review confirmed that harnesses own their lifecycle/callbacks and
cleanup; application domain, crypto and transport ownership is unchanged.

These tests access only the synthetic fixture screen. Physical devices, OS
reboot/suspension, backup protection, private sessions, wallet return, recovery
and real encrypted-message exchange still require their own acceptance.

The client transport boundary is implemented with demand-driven streaming, bounded cancellation and fail-closed installed dispatch; see the [API contract](MOBILE_API_TRANSPORT.md). The next assembled slice is the actual native HTTPS/private-session owner, original-wallet
opening/return, linking/recovery, a real encrypted exchange and persistence across
restart/suspend on both platforms. Complete secret custody before loading product
account data. Keep push, calls, media, links and the remaining parity matrix in
scope; these checks do not close those requirements.

References inspected on 2026-11-01:

- [Capacitor setup](https://capacitorjs.com/docs/getting-started/environment-setup)
- [Capacitor configuration](https://capacitorjs.com/docs/config)
- [HTTP API and large-file limits](https://capacitorjs.com/docs/apis/http)
- [Cookies API](https://capacitorjs.com/docs/apis/cookies)
- [Android backup configuration](https://developer.android.com/identity/data/autobackup)
- [Capacitor license](https://github.com/ionic-team/capacitor/blob/8.6.0/LICENSE)

## Current test artifact distinction

The default build/synchronization commands now package the full product. The
Android `NativeProductFlowTest` and iOS app-hosted `NativeProduct` scheme target
that installed product; synthetic signers are added only by explicit private
test composition. The historical feasibility targets below expect the former lab
entry and must not be run against the default full-product package. Their earlier
passes remain historical runtime evidence, not full feature acceptance.

On Xcode 27 the graphical device tool is Device Hub, not the former Simulator app.
See Apple's [Device Hub documentation](https://developer.apple.com/documentation/xcode/managing-your-simulated-and-physical-devices-in-device-hub).
Tool/window availability and successful compilation do not establish a passed
app flow. Current observed results and blocked diagnostics are tracked in the
[flow matrix](MOBILE_FLOW_TEST_MATRIX.md).

## Android media permission ownership — native contracts passed

`mobile/android/.../media/NativeMediaPermissions` owns one pending WebView
microphone/camera permission operation, its OS request, 30-second deadline and
cancellation/disposal. The existing activity only composes that owner with the
Capacitor chrome client; existing file-picker behavior remains delegated to
Capacitor. Media capture, encoding and cancellation stay in the existing feature
owners. No media data, backend endpoint, external provider or dependency is added.

Only a local packaged product document and a matching local requesting origin
may ask for the two recognized media resources. Unknown/duplicate resources and
overlapping requests are denied. Android's actual current OS permission is
checked before granting precisely the requested resources. Navigation,
backgrounding, renderer loss and disposal cancel the operation; a late OS result
cannot authorize a subsequent request. The OS-result slot remains occupied until
its callback even after WebView cancellation. Optional manifest capabilities do
not make hardware support mandatory or silently grant access.

The previous installed-product voice attempt actually failed with permission
denied. Four native instrumentation contracts passed for admission, resource scope,
denial and stale-result cancellation. Product validation subsequently observed the actual Android microphone prompt, real touch activation, nonempty emulated recorder samples, encrypted public-DM voice delivery and independent recipient playback. Camera, physical-media quality and the separately failed private-DM recovery path retain their own acceptance. See Android's
[permission request API](https://developer.android.com/reference/android/webkit/PermissionRequest)
and [runtime permission guidance](https://developer.android.com/training/permissions/requesting).

## iPhone startup after host restart — 2026-11-03

The complete native host now installs and launches. The original project path
blocked a coordinated read; an identical private local copy passed that read and
its native build. The first nonempty product XCTest then failed at the explicit
installed-entry connection error before login. This is a native startup failure,
not a passed session or full-product flow. The [current flow matrix](MOBILE_FLOW_TEST_MATRIX.md)
records the rejected zero-test result, actual failure and diagnostic boundaries.

The subsequent installed account test passed synthetic authentication/private
opening and empty WebView cookies with ordinary JavaScript constructors. Its
separate new-process restoration failed at native-entry initialization; the login
pass does not establish durable session restoration. All older startup failures
and the current investigation remain in the flow matrix.

The next diagnostic isolated a saved-item query taking about 72 seconds before
returning success. The corrected client budget did not establish native
restoration; the overall diagnostic hit its deadline. This platform-latency
evidence does not certify the app or identify the OS cause. Preserve the original
installation and repeat applicable acceptance only after the environment changes
or an authorized physical target becomes available.
