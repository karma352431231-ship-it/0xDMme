# Android installed-product and feasibility tests

## Exact packaged gzip assets

The Android asset merger decompresses `.gz` files and removes that suffix.
`app/asset-packaging.gradle` stages an extra gzip layer in declared build output
so the final APK retains the shared product's original filenames and bytes.
Shared mobile assets and their manifest are never rewritten by this step.
Android variant source providers connect staging to asset merging; assembly
also runs `verifyDebugGzipAssets` or `verifyReleaseGzipAssets` against the APK.
This regression check protects the emoji artwork and corresponding-source URLs.

The default `npm run mobile:build` and synchronization package the complete
product. `NativeProductFlowTest` targets that installed app and is separate from
the historical synthetic laboratory described below. The product test requires
an explicitly prepared debug overlay in the task's ignored `.local/` directory:
synthetic signer, public-DOM drivers, isolated TLS service and its private CA.
Normal/release assets must contain none of those test-only inputs.

Each product invocation owns its ActivityScenario and has bounded callbacks.
Public actions inspect the expected account/device authority before exercising
the UI. Supported phases include `login`, `restore`, `recreate`, `background`,
`logout`, `inspect` and `action`. `action` requires `productAction`/`productInput`
from the relevant `tests/fixtures/native-product-*.ts` driver. Fixture account and
address arguments are private test inputs, never production credentials.

Require the instrumentation assertion result as well as its explicit action
result; a successful Android shell exit alone does not mean the test passed.
Use the [flow matrix](../../docs/MOBILE_FLOW_TEST_MATRIX.md) for actual observed
passes, failed attempts and unresolved platform/OS prerequisites. Passing an
archive Blob test does not prove an OS save; matching attachment bytes does not
prove the OS picker; synthetic signing does not prove wallet-app interaction.

## Historical feasibility package

The following laboratory tests require the dedicated feasibility assets built
with `npm run mobile:feasibility:build`, with the native asset configuration
explicitly selecting `dist/mobile-feasibility` before synchronization. Do not run
them against the default complete-product package. Restore the normal
`dist/mobile` configuration afterward; do not commit a temporary machine setup.

The instrumentation test runs the existing packaged synthetic feasibility screen
inside the app's real Capacitor WebView. It checks the local secure origin,
canonical service identity, Web Locks, nonextractable WebCrypto device keys,
Matrix WASM encryption/decryption and reopening the stored fixture. It accesses
only the screen's public status/actions; it does not inspect or export keys.

`NativeFeasibilityTest` owns its ActivityScenario and bounded WebView callbacks.
JUnit teardown clears the synthetic fixture and closes the activity. The explicit
`create` phase preserves the verified fixture for a host-controlled process
restart; the existing fixture validity window still applies. The `restore` phase
requires the stored-fixture result and clears it during teardown. A newly created
fixture cannot satisfy that assertion. No product account database is accessed.

Use a dedicated test emulator, the project's Android SDK/JDK and Gradle wrapper.
Set `ANDROID_SERIAL` explicitly to the emulator selected for this test. Keep all
actual device identifiers, system-image/WebView versions and logs in `.local/`.

From this directory:

```sh
: "${ANDROID_SERIAL:?Select a dedicated Android test emulator}"
./gradlew --no-daemon --max-workers=2 :app:assembleDebug :app:assembleDebugAndroidTest
adb -s "$ANDROID_SERIAL" install -r app/build/outputs/apk/debug/app-debug.apk
adb -s "$ANDROID_SERIAL" install -r -t app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk
```

The default test is self-contained: it clears the test store, creates/verifies
the fixture, recreates the native activity/WebView, requires successful reopening,
and clears it again:

```sh
adb -s "$ANDROID_SERIAL" shell am instrument -w -r \
  -e class app.zeroxdmme.development.NativeFeasibilityTest \
  app.zeroxdmme.development.test/androidx.test.runner.AndroidJUnitRunner
```

For the process-restart workflow, run the same test with `fixturePhase=create`,
stop the target process, then run `fixturePhase=restore`:

```sh
adb -s "$ANDROID_SERIAL" shell am instrument -w -r \
  -e class app.zeroxdmme.development.NativeFeasibilityTest \
  -e fixturePhase create \
  app.zeroxdmme.development.test/androidx.test.runner.AndroidJUnitRunner
adb -s "$ANDROID_SERIAL" shell am force-stop app.zeroxdmme.development
adb -s "$ANDROID_SERIAL" shell pidof app.zeroxdmme.development
adb -s "$ANDROID_SERIAL" shell am instrument -w -r \
  -e class app.zeroxdmme.development.NativeFeasibilityTest \
  -e fixturePhase restore \
  app.zeroxdmme.development.test/androidx.test.runner.AndroidJUnitRunner
```

Check each instrumentation result for `OK (1 test)` and absence of runner errors;
the shell exit code alone does not prove a JUnit pass. After force-stop, `pidof`
must report no surviving target process. If the host workflow is interrupted
after creation, rerun the self-contained test to clear the synthetic record.

Additional `fixturePhase` values are `background`, `expired` and `corrupt`.
The background case requires actual CREATED/RESUMED activity states before
reopening. Negative cases alter only the existing synthetic fixture through
visible test controls, require explicit rejection, then clear it and prove that
a new valid fixture works. Every self-contained phase clears its record again
in teardown. These controls are part of the feasibility shell, not the product
account interface.

For host-controlled reboot tests, preserve with `create`, reboot only the
dedicated emulator, verify that its kernel boot ID changed, and require
`restore`. For an unchanged-schema upgrade, build version 1, create the fixture,
then build/install version 2 with `-PfeasibilityVersionCode=2` and require
`restore`. Check the installed version before and after. The property changes
only test build metadata and defaults to 1; it is not a store release scheme.
Keep a test emulator's later version when rebuilding subsequent cases rather
than forcing a version downgrade.

These checks establish only the observed synthetic WebView behavior. Physical
devices, OS reboot/suspend, backup protection, private session custody, wallet
return, recovery and real message exchange remain separate acceptance work. iOS
needs its own runtime validation; Android evidence does not establish WKWebView
support. The test uses the existing AndroidX test dependencies and leaves global
HTTP/cookie patching and WebView debugging disabled.

References:

- [AndroidJUnitRunner](https://developer.android.com/training/testing/instrumented-tests/androidx-test-libraries/runner)
- [ActivityScenario lifecycle](https://developer.android.com/reference/androidx/test/core/app/ActivityScenario)
- [Runtime contract](../../docs/MOBILE_RUNTIME_FEASIBILITY.md)
