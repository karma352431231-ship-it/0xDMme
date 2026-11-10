package app.zeroxdmme.development.session;

import static org.junit.Assert.*;
import static org.junit.Assume.assumeTrue;
import static androidx.test.espresso.Espresso.onView;
import static androidx.test.espresso.action.ViewActions.click;
import static androidx.test.espresso.matcher.ViewMatchers.withContentDescription;
import static androidx.test.espresso.matcher.ViewMatchers.withText;
import android.graphics.Rect;
import android.os.Build;
import android.os.SystemClock;
import android.view.View;
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
    @Test public void installedClientOpensProtectedTextAndImageThroughNativeBridge() throws Exception {
        var instrumentation = InstrumentationRegistry.getInstrumentation();
        assumeTrue("Use only the isolated fixture application", instrumentation.getTargetContext().getPackageName().endsWith(".recovery"));
        assumeTrue("true".equals(InstrumentationRegistry.getArguments().getString("viewOnceFixture")));
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            // Only the synthetic app may wake the display and run over the lock screen.
            scenario.onActivity(activity -> {
                if (Build.VERSION.SDK_INT >= 27) {
                    activity.setShowWhenLocked(true);
                    activity.setTurnScreenOn(true);
                }
            });
            await(scenario, "document.documentElement.dataset.viewOnceFixture === 'ready'");
            for (String type : new String[] {"text", "image"}) {
                evaluate(scenario, "document.querySelector('#protected-" + type + " button').click()");
                await(scenario, "document.documentElement.dataset.shown === 'Synthetic " + type + "'");
                scenario.onActivity(activity -> assertTrue((activity.getWindow().getAttributes().flags & WindowManager.LayoutParams.FLAG_SECURE) != 0));
                Rect message = bounds(onView(withText("Synthetic " + type)));
                Rect group = new Rect(message);
                if (type.equals("image")) {
                    Rect photo = bounds(onView(withContentDescription("View-once image")));
                    assertTrue("Caption must be below the complete photo", photo.bottom < message.top);
                    assertEquals("Square photo keeps its aspect ratio", photo.width(), photo.height());
                    group.union(photo);
                }
                onView(withText("Synthetic " + type)).check((view, missing) -> {
                    if (missing != null) throw missing;
                    Rect window = visibleBounds(view.getRootView());
                    assertTrue("Content is centered in the viewer",
                        Math.abs(group.centerY() - window.centerY()) < window.height() / 8);
                });
                onView(withContentDescription("Close view-once message")).perform(click());
                await(scenario, "document.documentElement.dataset.closed === 'true'");
                await(scenario, "document.querySelector('#protected-" + type + " button').disabled");
                scenario.onActivity(activity -> assertEquals(0, activity.getWindow().getAttributes().flags & WindowManager.LayoutParams.FLAG_SECURE));
            }
        }
    }

    private static Rect bounds(androidx.test.espresso.ViewInteraction target) {
        AtomicReference<Rect> result = new AtomicReference<>();
        target.check((view, missing) -> {
            if (missing != null) throw missing;
            result.set(visibleBounds(view));
        });
        return result.get();
    }

    private static Rect visibleBounds(View view) {
        Rect bounds = new Rect();
        assertTrue(view.getGlobalVisibleRect(bounds));
        return bounds;
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
