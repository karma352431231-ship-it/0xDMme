# iOS installed-product and feasibility tests

The default mobile build packages the complete product. The app-hosted
`NativeProduct` scheme targets that package and compiles successfully. Its
native host now installs and opens after host/runtime preparation. A selected
account case passed synthetic authentication, private opening and empty WebView
cookies. New-process restoration then failed at installed-entry initialization;
remaining product acceptance stays open. See the [flow matrix](../../docs/MOBILE_FLOW_TEST_MATRIX.md).
Do not report compilation or the older laboratory pass as a full-product pass.

## Historical feasibility package

The following `RuntimeFeasibility` scheme expects the separate laboratory entry
from `npm run mobile:feasibility:build`. Select `dist/mobile-feasibility` explicitly
in the native asset configuration before synchronization, and restore the normal
`dist/mobile` configuration afterward. It must not run against the default
complete-product assets. Temporary signing/device setup stays outside Git.

The separate `RuntimeFeasibilityTests` UI-test target drives the existing packaged
synthetic screen in its real WKWebView. It clears the test record, creates and
verifies a fixture, terminates the app, asserts that it stopped, relaunches it and
requires the stored-fixture result. A replacement fixture cannot satisfy that
assertion. The visible result also confirms Web Locks, nonextractable WebCrypto
device keys, Matrix WASM encryption/decryption and the canonical service identity.

The test owns its `XCUIApplication` lifecycle. Teardown clears the synthetic
record and terminates the app. Only the feasibility screen's public controls and
status are accessed; no key-export or product-account operation is introduced.
The UI-test target is separate from the distributed app and uses Xcode's XCTest
frameworks. It adds no third-party package or production bridge/plugin.
The UI-test target requires iOS 17 or later for the platform XCTest frameworks;
the app's deployment target and unverified device-support matrix are unchanged.

Use an installed compatible iOS simulator runtime and a dedicated test simulator.
Set `IOS_TEST_UDID` to that simulator's identifier. Actual simulator identifiers,
toolchain/runtime inventory, screenshots and result bundles belong in `.local/`.
From this directory:

```sh
: "${IOS_TEST_UDID:?Select a dedicated iOS test simulator}"
xcodebuild -project App/App.xcodeproj -scheme RuntimeFeasibility \
  -configuration Debug -sdk iphonesimulator \
  -destination "id=$IOS_TEST_UDID" -parallel-testing-enabled NO \
  -test-timeouts-enabled YES -default-test-execution-time-allowance 300 \
  -maximum-test-execution-time-allowance 420 \
  -derivedDataPath ../../.local/ios-test-derived-data \
  -resultBundlePath ../../.local/ios-runtime-test.xcresult \
  CODE_SIGN_IDENTITY=- test
```

Use a fresh result-bundle path for each invocation. The command uses local ad-hoc
signing for the simulator; physical-device installation requires its own
development signing. Stop the dedicated simulator after the run. Test attachments
include the visible restored-fixture result; they contain only synthetic content.

This checks the observed WKWebView/process-restart behavior. Physical devices,
OS reboot/suspension, backup protection, private sessions, wallet return, account
recovery and real encrypted messages remain separate acceptance work.

The test runner accepts `NATIVE_FIXTURE_PHASE` in its own environment:
`process` (default), `background`, `prepare`, `restore`, `expired` or `corrupt`.
The background case presses Home and requires a background state before
activation/reopening. `prepare` intentionally preserves its valid fixture while
still terminating the app. `restore` requires that preexisting fixture and clears
it. Negative cases require explicit rejection and successful creation after
synthetic cleanup. No key export or product-store mutation is available.

For host-controlled phases, use a generated `.xctestrun` file from
`build-for-testing`; set the runner target's
`EnvironmentVariables.NATIVE_FIXTURE_PHASE` and run `test-without-building`.
Preserve its original product-path resolution if copying the file. Require both
XCTest success and the printed `0xDMme native fixture phase: <phase>` marker; an
unset environment variable must not silently pass a different workflow.
`prepare`/`restore` can surround a dedicated simulator shutdown/boot or an
in-place `CURRENT_PROJECT_VERSION=1` to `2` app update. Check the installed version
and simulator states. A CoreSimulator restart does not prove physical kernel
restart or iOS suspension behavior. Keep operation waits bounded and distinguish
runner preparation failure from an executed application assertion.

- [XCUIApplication lifecycle](https://developer.apple.com/documentation/xcuiautomation/xcuiapplication)
- [Runtime contract](../../docs/MOBILE_RUNTIME_FEASIBILITY.md)

Current native acceptance selects individual classes/methods and checks both the
phase marker and the result bundle's nonzero executed-case count. In an
`.xctestrun` target's `OnlyTestIdentifiers`, use `Class/method`; the target prefix
belongs to the command-line selector format and previously selected zero cases.
A nominal executor success with zero tests is rejected.

The installed account scenario waits for the mounted product route and visible,
enabled wallet-picker controls. `NativeProductTestDriver` owns a weak view
reference and bounded JavaScript evaluations. `NativeProfileFlowTests` has
explicit prepare/restore phases for private profile/preferences and theme; it
compiled but remains pending runtime acceptance. `NativeStartupDiagnosticTests`
is separate and requires an explicit diagnostic environment flag. Its uniquely
scoped synthetic Keychain probe must never be counted as cold-login acceptance.

The latest environment returned a protected saved-item read only after about
72 seconds; the diagnostic hit its overall deadline. Native restoration remains
failed despite the bounded shared readiness fix. A responsive native environment
or authorized physical target is required for the remaining cases.

Account/profile acceptance requires `NATIVE_PRODUCT_ADDRESS`, the dedicated
synthetic EVM address, and checks that exact address in the actual Profile UI.
The account test accepts `NATIVE_PRODUCT_PHASE=login` or `restore`. The profile
test accepts `NATIVE_PROFILE_PHASE=prepare` or `restore` and an explicit
`NATIVE_PROFILE_NAME` beginning with `Synthetic iPhone `. Missing fixture
configuration skips the scenario; the external acceptance runner rejects skips
or zero executed cases. Keep addresses, seeds, simulator IDs and generated run
files in ignored private storage. A new-install original-wallet comparison has
its own result and cannot close a failed existing-install restoration case.

The private direct-product fixture provides an alternative execution path when
Xcode stalls before any selected case starts. It uses the installed App without
an XCTest plugin. `tests/fixtures/native-ios-direct-driver.ts` owns the public-DOM
workflow, cancellation and deadline. The separate
`tests/fixtures/native-ios-direct-reporter.swift` is compiled only into an
explicit `DEBUG && MOBILE_SYNTHETIC_TEST` local project copy. That copy alone
contains the observer's controller composition and App-only scheme; the ordinary
host project has no observer hook.

The observer requires a dedicated synthetic bundle marker plus explicit
`NATIVE_UI_RUN_ID`, `NATIVE_UI_PHASE`, `NATIVE_UI_ADDRESS` and `NATIVE_UI_INPUT`.
Supported phases are `login`, `restore`, `profile-prepare` and `profile-restore`.
The input is empty for account phases and starts with `Synthetic iPhone ` for
profile phases. Keep all environment values in private local files. The observer
admits one bounded main-frame/local-origin report and independently checks the
current document, exact original wallet, private UI, cookie isolation, phone
viewport and native foreground view. It emits only run metadata and booleans.
It never calls protected storage, prewarms custody or grants authentication.

The host must verify ordinary product-script bytes, no XCTest plugins and the
signed artifact; reject a boot that reports failed system migration even if its
exit status is zero; require exactly one matching native phase result; and prove
a different running App PID after the previous process stops. A report deadline,
missing result, failed postcondition or interrupted preparation is not a pass.
Direct DOM automation checks assembled product behavior; physical taps, external
wallet apps, permissions and actual-device lifecycle remain separate acceptance.

`NativeTransportContractTests` adds four independent Swift request/response/body
contract cases to the installed test target. They preserve signed UTF-8, reject
untrusted request fields/paths and malformed wire identities, preserve real HTTP
failure status while filtering private headers, and check exact buffered reads,
EOF, declared length and the delivered-buffer bound. They never open Keychain or
resume a network task. Compilation and runtime execution must be reported
separately. These cases do not replace live HTTPS, cookie-custody or UI tests.

Before runtime acceptance, check both the simulator's reported boot/migration
outcome and the installed runtime's signature verification. A Ready image with
unknown signature state is insufficient if explicit verification fails. Preserve
the original device/account while repairing platform support. A platform-control
application and screenshot deadline can distinguish a currently unresponsive
simulator from a product-only launch failure; neither is product acceptance.

The latest four-case contract target compiled. The same exact pure Swift sources
also passed four XCTest cases on macOS in a private complementary control; this
is not iPhone runtime acceptance. Select
`NativeTransportContractTests` in the installed `NativeProductTests` target and
require four executed, passed cases when a verified iOS runtime becomes usable.
The zero-case footer from a separate test library is never the pass criterion.

The current iOS images fail explicit signature verification (-67054); same-build
supported import reaches a disk-space gate. Original devices/accounts are
preserved. Further product runtime cases await a verified image and sufficient
free space. Removing an additional installed runtime is destructive and requires
the owner's explicit choice; no implicit approval follows from the overall test
instruction.
