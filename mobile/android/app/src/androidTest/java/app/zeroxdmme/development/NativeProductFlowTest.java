package app.zeroxdmme.development;

import static org.junit.Assert.*;
import android.os.SystemClock;
import android.os.Bundle;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.json.JSONObject;
import org.json.JSONTokener;
import org.junit.After;
import org.junit.Test;
import org.junit.runner.RunWith;

/** Drives the complete installed product through its public DOM. Signers exist
 * only in the explicitly prepared private debug overlay, with real API auth.
 */
@RunWith(AndroidJUnit4.class)
public class NativeProductFlowTest {
    private ActivityScenario<MainActivity> scenario;

    @After public void close() { if (scenario != null) scenario.close(); }

    @Test public void syntheticAccountFlow() throws Exception {
        String phase = InstrumentationRegistry.getArguments().getString("productPhase", "login");
        assertTrue(java.util.Set.of("login", "restore", "recreate", "background", "logout", "action", "inspect").contains(phase));
        scenario = ActivityScenario.launch(MainActivity.class);
        String targetPackage = InstrumentationRegistry.getInstrumentation().getTargetContext().getPackageName();
        scenario.onActivity(activity -> assertEquals("The test launched the wrong installed application", targetPackage, activity.getPackageName()));
        await("document.querySelector('#app-shell')?.dataset.page && document.querySelector('html').dataset.testApp", 90_000);
        assertEquals("\"https://localhost\"", evaluate("location.origin"));
        assertEquals("true", evaluate("isSecureContext && innerWidth <= 500 && !!window.ZeroXSession"));
        awaitWindowFocus();
        // The installed API never installs authentication cookies in WebView.
        assertEquals("\"\"", evaluate("document.cookie"));
        if (phase.equals("action") || phase.equals("inspect")) {
            await("document.querySelector('#app-shell').dataset.account === 'connected' && !!window.syntheticNativeProduct", 30_000);
            inspectAccount();
            if (phase.equals("inspect")) return;
            runPublicAction();
            return;
        }
        evaluate("location.hash = 'perfil'");
        await("document.querySelector('#app-shell').dataset.page === 'perfil' && !!document.querySelector('[data-account-status]')", 15_000);
        if (phase.equals("login")) login();
        else await("document.querySelector('#app-shell').dataset.account === 'connected'", 25_000);
        if (phase.equals("recreate")) {
            scenario.recreate();
            await("document.querySelector('#app-shell')?.dataset.account === 'connected'", 60_000);
        }
        if (phase.equals("background")) {
            scenario.moveToState(androidx.lifecycle.Lifecycle.State.CREATED);
            SystemClock.sleep(1500);
            scenario.moveToState(androidx.lifecycle.Lifecycle.State.RESUMED);
            await("document.querySelector('#app-shell')?.dataset.account === 'connected'", 30_000);
            inspectAccount();
        }
        if (phase.equals("logout")) {
            await("document.querySelector('[data-logout]') && !document.querySelector('[data-logout]').disabled", 20_000);
            click("[data-logout]");
            await("document.querySelector('#app-shell').dataset.account === 'guest'", 20_000);
            scenario.recreate();
            await("document.querySelector('#app-shell')?.dataset.account === 'guest'", 60_000);
        }
        assertEquals("\"\"", evaluate("document.cookie"));
    }

    private void inspectAccount() throws Exception {
        String account = InstrumentationRegistry.getArguments().getString("productAccount", "");
        assertTrue("A synthetic account is required", account.matches("[a-f0-9-]{36}"));
        String address = InstrumentationRegistry.getArguments().getString("productAddress", "");
        assertTrue("A synthetic EVM address is required", address.matches("0x[a-f0-9]{40}"));
        evaluate("location.hash = 'perfil'");
        await("document.querySelector('[data-account-address]')?.title.toLowerCase() === " + JSONObject.quote("wallet evm: " + address), 20_000);
        evaluate("window.syntheticNativeDiagnostics.capture(" + JSONObject.quote(account) + ")");
        await("window.syntheticNativeDiagnostics.captured", 10_000);
        Bundle progress = new Bundle();
        progress.putString("nativeProductBefore", evaluate("JSON.stringify(window.syntheticNativeDiagnostics.metadata)"));
        InstrumentationRegistry.getInstrumentation().sendStatus(2, progress);
    }

    private void runPublicAction() throws Exception {
        String action = InstrumentationRegistry.getArguments().getString("productAction", "");
        String input = InstrumentationRegistry.getArguments().getString("productInput", "");
        assertTrue(action.length() <= 64 && input.length() <= 1024);
        evaluate("window.syntheticNativeProduct.start(" + JSONObject.quote(action) + "," + JSONObject.quote(input) + ")");
        if (action.equals("voice-record") || action.startsWith("social-voice-")) {
            tapSyntheticRecorder(action.equals("voice-record") ? 2 : 1);
            if (!action.equals("social-voice-receive")) acceptSyntheticMicrophonePrompt();
        }
        await("window.syntheticNativeProduct.state.status !== 'running'", 70_000);
        JSONObject result = new JSONObject((String) new JSONTokener(evaluate("JSON.stringify(window.syntheticNativeProduct.state)")).nextValue());
        Bundle progress = new Bundle();
        progress.putString("nativeProductResult", result.toString());
        InstrumentationRegistry.getInstrumentation().sendStatus(2, progress);
        System.out.println("NATIVE_PRODUCT_RESULT:" + result.toString());
        if (!result.getString("status").equals("passed")) {
            String visible = evaluate("document.body.innerText.slice(0, 1800)");
            String controls = publicControls();
            System.out.println("NATIVE_PRODUCT_VISIBLE:" + visible);
            System.out.println("NATIVE_PRODUCT_CONTROLS:" + controls);
            String account = InstrumentationRegistry.getArguments().getString("productAccount", "");
            evaluate("window.syntheticNativeDiagnostics.capture(" + JSONObject.quote(account) + ")");
            await("window.syntheticNativeDiagnostics.captured", 10_000);
            Bundle diagnostics = new Bundle();
            diagnostics.putString("nativeProductDiagnostics", (String) new JSONTokener(evaluate("JSON.stringify(window.syntheticNativeDiagnostics)")).nextValue());
            diagnostics.putString("nativeProductControls", (String) new JSONTokener(controls).nextValue());
            diagnostics.putString("nativeProductVisible", (String) new JSONTokener(visible).nextValue());
            InstrumentationRegistry.getInstrumentation().sendStatus(2, diagnostics);
            System.out.println("NATIVE_PRODUCT_DIAGNOSTICS:" + evaluate("JSON.stringify(window.syntheticNativeDiagnostics)"));
        }
        assertEquals("Public product flow failed: " + action + ": " + result.getString("value"), "passed", result.getString("status"));
        if (InstrumentationRegistry.getArguments().getString("productCapture", "false").equals("true")) capturePassedScreen();
    }

    private String publicControls() throws Exception {
        return evaluate("""
            JSON.stringify({
              page:document.querySelector('#app-shell')?.dataset.page,
              accountStatus:document.querySelector('[data-account-status]')?.textContent,
              profileStatus:document.querySelector('[data-profile-status]')?.textContent,
              privateHidden:document.querySelector('[data-private-profile]')?.hidden,
              messageStatus:document.querySelector('[data-message-status]')?.textContent,
              refreshDisabled:document.querySelector('[data-message-refresh]')?.disabled,
              composerDisabled:document.querySelector('[data-message-text]')?.disabled,
              typedLength:document.querySelector('[data-message-text]')?.value.length,
              bubbles:document.querySelectorAll('[data-message-history] [data-message]').length,
              fileDisabled:document.querySelector('[data-direct-conversation] [data-attachment-file]')?.disabled,
              fileCount:document.querySelector('[data-direct-conversation] [data-attachment-file]')?.files.length,
              preview:document.querySelector('[data-direct-conversation] [data-attachment-preview]')?.textContent,
              sendDisabled:document.querySelector('[data-direct-conversation] [data-compose-send]')?.disabled,
              toast:document.querySelector('.app-toast')?.textContent,
              groupTitle:document.querySelector('[data-group-title]')?.textContent,
              groupCount:document.querySelector('[data-group-count]')?.textContent,
              groupNotice:document.querySelector('[data-group-notice]')?.textContent,
              communityFields:[...document.querySelectorAll('[data-communities] input,[data-communities] textarea')].map(e=>({length:e.value.length,disabled:e.disabled})),
              communityButtons:[...document.querySelectorAll('[data-communities] button')].slice(0,12).map(e=>({label:e.textContent,disabled:e.disabled}))
            })
            """);
    }

    /** Real touch gestures preserve WebView's microphone/audio activation rules. */
    private void tapSyntheticRecorder(int taps) throws Exception {
        android.content.Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        assertTrue(java.util.Arrays.asList(context.getAssets().list("")).contains("native-synthetic-test.json"));
        await("!!document.querySelector('[data-native-test-tap=voice-record]') || window.syntheticNativeProduct.state.status !== 'running'", 65_000);
        if (!evaluate("!!document.querySelector('[data-native-test-tap=voice-record]')").equals("true")) return;
        JSONObject rect = new JSONObject((String) new JSONTokener(evaluate("""
            JSON.stringify((()=>{const rect=document.querySelector('[data-native-test-tap=voice-record]').getBoundingClientRect();return {x:(rect.x+rect.width/2)*devicePixelRatio,y:(rect.y+rect.height/2)*devicePixelRatio};})())
            """)).nextValue());
        float[] point = {(float) rect.getDouble("x"), (float) rect.getDouble("y")};
        scenario.onActivity(activity -> {
            assertTrue("The app must own the window before injecting a gesture", activity.hasWindowFocus());
            android.webkit.WebView view = activity.getBridge().getWebView();
            assertTrue(point[0] > 0 && point[0] < view.getWidth() && point[1] > 0 && point[1] < view.getHeight());
            int[] offset = new int[2];
            view.getLocationOnScreen(offset);
            point[0] += offset[0];
            point[1] += offset[1];
        });
        android.app.UiAutomation automation = InstrumentationRegistry.getInstrumentation().getUiAutomation();
        for (int tap = 0; tap < taps; tap++) {
            touch(automation, point[0], point[1]);
            SystemClock.sleep(70);
        }
    }

    private void awaitWindowFocus() {
        AtomicReference<Boolean> focused = new AtomicReference<>(false);
        long deadline = SystemClock.elapsedRealtime() + 10_000;
        do {
            scenario.onActivity(activity -> focused.set(activity.hasWindowFocus()));
            if (focused.get()) return;
            SystemClock.sleep(200);
        } while (SystemClock.elapsedRealtime() < deadline);
        fail("The installed app did not own the active window; inspect emulator/system dialogs.");
    }

    private void touch(android.app.UiAutomation automation, float x, float y) {
        long started = SystemClock.uptimeMillis();
        android.view.MotionEvent down = android.view.MotionEvent.obtain(started, started, android.view.MotionEvent.ACTION_DOWN, x, y, 0);
        down.setSource(android.view.InputDevice.SOURCE_TOUCHSCREEN);
        try { assertTrue(automation.injectInputEvent(down, true)); }
        finally { down.recycle(); }
        SystemClock.sleep(50);
        android.view.MotionEvent up = android.view.MotionEvent.obtain(started, SystemClock.uptimeMillis(), android.view.MotionEvent.ACTION_UP, x, y, 0);
        up.setSource(android.view.InputDevice.SOURCE_TOUCHSCREEN);
        try { assertTrue(automation.injectInputEvent(up, true)); }
        finally { up.recycle(); }
    }

    /** Only the explicit synthetic fixture may automate its own OS mic prompt. */
    private void acceptSyntheticMicrophonePrompt() throws Exception {
        android.content.Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        assertTrue(java.util.Arrays.asList(context.getAssets().list("")).contains("native-synthetic-test.json"));
        if (context.checkSelfPermission(android.Manifest.permission.RECORD_AUDIO) == android.content.pm.PackageManager.PERMISSION_GRANTED) return;
        android.app.UiAutomation automation = InstrumentationRegistry.getInstrumentation().getUiAutomation();
        android.accessibilityservice.AccessibilityServiceInfo previous = automation.getServiceInfo();
        android.accessibilityservice.AccessibilityServiceInfo configured = automation.getServiceInfo();
        configured.flags |= android.accessibilityservice.AccessibilityServiceInfo.FLAG_REPORT_VIEW_IDS;
        automation.setServiceInfo(configured);
        long deadline = SystemClock.elapsedRealtime() + 15_000;
        try {
            do {
                android.view.accessibility.AccessibilityNodeInfo root = automation.getRootInActiveWindow();
                if (root != null && "com.android.permissioncontroller".equals(String.valueOf(root.getPackageName())) &&
                    !root.findAccessibilityNodeInfosByText("0xDMme").isEmpty()) {
                    for (android.view.accessibility.AccessibilityNodeInfo button : root.findAccessibilityNodeInfosByViewId(
                        "com.android.permissioncontroller:id/permission_allow_foreground_only_button")) {
                        if (button.isEnabled() && button.performAction(android.view.accessibility.AccessibilityNodeInfo.ACTION_CLICK)) {
                            Bundle progress = new Bundle();
                            progress.putBoolean("nativeMicrophoneOsPromptAccepted", true);
                            InstrumentationRegistry.getInstrumentation().sendStatus(2, progress);
                            return;
                        }
                    }
                }
                if (!evaluate("window.syntheticNativeProduct.state.status === 'running'").equals("true")) return;
                SystemClock.sleep(200);
            } while (SystemClock.elapsedRealtime() < deadline);
            fail("The synthetic app's expected Android microphone permission prompt was not observed.");
        } finally {
            automation.setServiceInfo(previous);
        }
    }

    /** One optional synthetic-only cache image, before ActivityScenario teardown.
     * The host copies it into private evidence; it is never a release feature. */
    private void capturePassedScreen() throws Exception {
        android.content.Context target = InstrumentationRegistry.getInstrumentation().getTargetContext();
        assertTrue(java.util.Arrays.asList(target.getAssets().list("")).contains("native-synthetic-test.json"));
        scenario.onActivity(activity -> assertTrue("The tested app must own the visible window", activity.hasWindowFocus()));
        android.graphics.Bitmap bitmap = InstrumentationRegistry.getInstrumentation().getUiAutomation().takeScreenshot();
        assertNotNull("The visible virtual phone did not provide an image", bitmap);
        try (java.io.FileOutputStream output = new java.io.FileOutputStream(new java.io.File(target.getCacheDir(), "native-product-last-pass.png"))) {
            assertTrue(bitmap.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, output));
        } finally {
            bitmap.recycle();
        }
    }

    private void login() throws Exception {
        await("document.querySelector('[data-account-status]')?.textContent !== 'Verificando sessão…'", 20_000);
        if (evaluate("document.querySelector('#app-shell').dataset.account === 'connected'").equals("true")) {
            await("document.querySelector('[data-logout]') && !document.querySelector('[data-logout]').disabled", 20_000);
            click("[data-logout]");
            await("document.querySelector('#app-shell').dataset.account === 'guest'", 20_000);
        }
        await("!document.querySelector('[data-wallet-brand=MetaMask]')?.disabled", 15_000);
        click("[data-wallet-brand=MetaMask]");
        click("[data-wallet=MetaMask]");
        await("document.querySelector('#app-shell').dataset.account === 'connected'", 60_000);
        await("document.querySelector('[data-private-profile]')?.hidden === false", 90_000);
    }

    private void click(String selector) throws Exception {
        assertEquals("Public action unavailable: " + selector, "true", evaluate("(() => { const node = document.querySelector(" + JSONObject.quote(selector) + "); if (!node || node.disabled || node.hidden) return false; node.click(); return true; })()"));
    }

    private void await(String condition, long timeout) throws Exception {
        long deadline = SystemClock.elapsedRealtime() + timeout;
        do {
            if (evaluate("Boolean(" + condition + ")").equals("true")) return;
            SystemClock.sleep(250);
        } while (SystemClock.elapsedRealtime() < deadline);
        Object text = new JSONTokener(evaluate("document.body.innerText.slice(0, 1800)")).nextValue();
        System.out.println("NATIVE_PRODUCT_DIAGNOSTICS:" + evaluate("JSON.stringify(window.syntheticNativeDiagnostics)"));
        fail("Native product did not reach the expected public state: " + text);
    }

    private String evaluate(String script) throws Exception {
        CountDownLatch completed = new CountDownLatch(1);
        AtomicReference<String> result = new AtomicReference<>();
        scenario.onActivity(activity -> activity.getBridge().getWebView().evaluateJavascript(script, value -> {
            result.set(value);
            completed.countDown();
        }));
        assertTrue("The installed WebView did not reply", completed.await(8, TimeUnit.SECONDS));
        return result.get();
    }
}
