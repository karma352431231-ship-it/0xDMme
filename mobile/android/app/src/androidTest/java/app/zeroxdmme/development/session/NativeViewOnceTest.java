package app.zeroxdmme.development.session;

import static org.junit.Assert.*;
import static org.junit.Assume.assumeTrue;
import android.os.SystemClock;
import android.view.WindowManager;
import android.webkit.WebView;
import androidx.test.core.app.ActivityScenario;
import androidx.test.platform.app.InstrumentationRegistry;
import app.zeroxdmme.development.MainActivity;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.json.JSONObject;
import org.junit.Test;

/** Synthetic native rendering only; no account, wallet, server or private history. */
public class NativeViewOnceTest {
    @Test public void decoderBenchmarkUsesOnlySyntheticBytes() throws Exception {
        var instrumentation = InstrumentationRegistry.getInstrumentation();
        String encoded = InstrumentationRegistry.getArguments().getString("decoderBenchmark");
        assumeTrue("Provide the bundled synthetic decoder benchmark", encoded != null);
        assertTrue(encoded.length() < 128000);
        String script = new String(android.util.Base64.decode(encoded, android.util.Base64.NO_WRAP), java.nio.charset.StandardCharsets.UTF_8);
        AtomicReference<WebView> owner = new AtomicReference<>();
        CountDownLatch loaded = new CountDownLatch(1), finished = new CountDownLatch(1);
        AtomicReference<String> result = new AtomicReference<>();
        instrumentation.runOnMainSync(() -> {
            WebView view = new WebView(instrumentation.getTargetContext());
            owner.set(view);
            view.getSettings().setJavaScriptEnabled(true);
            view.getSettings().setBlockNetworkLoads(true);
            view.getSettings().setAllowFileAccess(false);
            view.getSettings().setAllowContentAccess(false);
            view.setWebViewClient(new android.webkit.WebViewClient() {
                @Override public void onPageFinished(WebView ignored, String url) { loaded.countDown(); }
            });
            view.loadDataWithBaseURL("https://benchmark.invalid", "<!doctype html><title>Synthetic decoder</title>", "text/html", "UTF-8", null);
        });
        try {
            assertTrue("Synthetic WebView did not load", loaded.await(10, TimeUnit.SECONDS));
            instrumentation.runOnMainSync(() -> owner.get().evaluateJavascript(script + ";JSON.stringify(decoderBenchmark.runDecoderBenchmark())", value -> { result.set(value); finished.countDown(); }));
            assertTrue("Synthetic benchmark exceeded its deadline", finished.await(30, TimeUnit.SECONDS));
            Object text = new org.json.JSONTokener(result.get()).nextValue();
            assertTrue("Synthetic benchmark failed", text instanceof String);
            JSONObject report = new JSONObject((String) text);
            assertEquals(131072, report.getInt("blockBytes"));
            android.os.Bundle status = new android.os.Bundle();
            status.putString("stream", "DECODER_BENCHMARK " + report + "\n");
            instrumentation.sendStatus(0, status);
        } finally {
            instrumentation.runOnMainSync(() -> { owner.get().stopLoading(); owner.get().destroy(); });
        }
    }

    @Test public void installedClientOpensProtectedTextAndImageThroughNativeBridge() throws Exception {
        var instrumentation = InstrumentationRegistry.getInstrumentation();
        assumeTrue("Use only the isolated fixture application", instrumentation.getTargetContext().getPackageName().endsWith(".recovery"));
        assumeTrue("true".equals(InstrumentationRegistry.getArguments().getString("viewOnceFixture")));
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            await(scenario, "document.documentElement.dataset.viewOnceFixture === 'ready'");
            for (String type : new String[] {"text", "image"}) {
                evaluate(scenario, "document.querySelector('#protected-" + type + " button').click()");
                await(scenario, "document.documentElement.dataset.shown === 'Synthetic " + type + "'");
                scenario.onActivity(activity -> assertTrue((activity.getWindow().getAttributes().flags & WindowManager.LayoutParams.FLAG_SECURE) != 0));
                evaluate(scenario, "document.dispatchEvent(new Event('fixture-close-view'))");
                await(scenario, "document.documentElement.dataset.closed === 'true'");
                await(scenario, "document.querySelector('#protected-" + type + " button').disabled");
                scenario.onActivity(activity -> assertEquals(0, activity.getWindow().getAttributes().flags & WindowManager.LayoutParams.FLAG_SECURE));
            }
        }
    }

    private static void await(ActivityScenario<MainActivity> scenario, String condition) throws Exception {
        long deadline = SystemClock.elapsedRealtime() + 20_000;
        while (SystemClock.elapsedRealtime() < deadline) {
            if ("true".equals(evaluate(scenario, condition))) return;
            SystemClock.sleep(100);
        }
        fail("Fixture condition did not pass: " + condition);
    }

    private static String evaluate(ActivityScenario<MainActivity> scenario, String script) throws Exception {
        var response = new AtomicReference<String>();
        var ready = new CountDownLatch(1);
        scenario.onActivity(activity -> activity.getBridge().getWebView().evaluateJavascript(script, value -> {
            response.set(value);
            ready.countDown();
        }));
        assertTrue(ready.await(5, TimeUnit.SECONDS));
        return response.get();
    }

    @Test public void secureWindowClosesAndRevokesItsNativeCapability() throws Exception {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            AtomicReference<Throwable> failure = new AtomicReference<>();
            scenario.onActivity(activity -> {
                try {
                    boolean original = (activity.getWindow().getAttributes().flags & WindowManager.LayoutParams.FLAG_SECURE) != 0;
                    AtomicReference<Boolean> active = new AtomicReference<>(false);
                    NativeViewOnce owner = new NativeViewOnce(new WebView(activity), active::set);
                    String id = UUID.randomUUID().toString();
                    JSONObject reference = new JSONObject().put("id",id);
                    assertEquals(true, owner.dispatch("view-begin",new JSONObject().put("id",id).put("mime","text/plain").put("bytes",0)));
                    assertTrue(active.get());
                    assertTrue((activity.getWindow().getAttributes().flags & WindowManager.LayoutParams.FLAG_SECURE) != 0);
                    assertEquals(true, owner.dispatch("view-show",new JSONObject().put("id",id).put("text","Synthetic protected message")));
                    assertEquals(true, owner.dispatch("view-active",reference));
                    owner.close();
                    assertFalse(active.get());
                    assertEquals(false, owner.dispatch("view-active",reference));
                    assertEquals(original,(activity.getWindow().getAttributes().flags & WindowManager.LayoutParams.FLAG_SECURE) != 0);
                    assertThrows(Exception.class, () -> owner.dispatch("view-show",new JSONObject().put("id",id).put("text","Cannot reopen")));
                    assertThrows(Exception.class, () -> owner.dispatch("view-begin",new JSONObject().put("id",id).put("mime","text/html").put("bytes",12)));
                } catch(Throwable error) {failure.set(error);}
            });
            if(failure.get()!=null) throw new AssertionError(failure.get());
        }
    }
}
