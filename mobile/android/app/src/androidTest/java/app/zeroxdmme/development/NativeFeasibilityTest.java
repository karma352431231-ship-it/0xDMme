package app.zeroxdmme.development;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

import android.os.SystemClock;
import androidx.lifecycle.Lifecycle;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.filters.LargeTest;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import java.util.Set;
import org.json.JSONObject;
import org.json.JSONTokener;
import org.junit.After;
import org.junit.Test;
import org.junit.runner.RunWith;

/** Exercises the packaged WebView, not a browser mock or a product account. */
@RunWith(AndroidJUnit4.class)
@LargeTest
public class NativeFeasibilityTest {
    private ActivityScenario<MainActivity> scenario;
    private boolean ready;
    private boolean preservePreparedFixture;

    @Test
    public void verifiesPersistentSyntheticFixture() throws Exception {
        String phase = InstrumentationRegistry.getArguments().getString("fixturePhase", "recreate");
        assertTrue("Unknown fixture phase", Set.of("recreate", "create", "restore", "background", "expired", "corrupt").contains(phase));
        openShell();
        if (phase.equals("restore")) {
            verifyRestoredFixture();
        } else {
            createFixture();
            if (phase.equals("create")) {
                // The host must force-stop the package, then run the restore phase.
                // The existing synthetic store also enforces its 30-minute lifetime.
                preservePreparedFixture = true;
            } else {
                if (phase.equals("expired") || phase.equals("corrupt")) {
                    verifyRejectedFixture(phase);
                    return;
                }
                transition(phase);
            }
            if (!preservePreparedFixture) verifyRestoredFixture();
        }
    }

    private void verifyRejectedFixture(String phase) throws Exception {
        if (phase.equals("expired")) {
            click("expire");
            awaitResult("Synthetic fixture marked expired. Run checks to verify rejection.");
        } else {
            click("corrupt");
            awaitResult("Synthetic ciphertext altered. Run checks to verify rejection.");
        }
        click("run");
        awaitResult("Check failed or expired. No success was recorded.");
        // Explicit clearing must restore the ability to create a valid fixture.
        createFixture();
    }

    private void transition(String phase) throws Exception {
        ready = false;
        if (phase.equals("background")) {
            scenario.moveToState(Lifecycle.State.CREATED);
            assertEquals(Lifecycle.State.CREATED, scenario.getState());
            SystemClock.sleep(2_000);
            scenario.moveToState(Lifecycle.State.RESUMED);
            assertEquals(Lifecycle.State.RESUMED, scenario.getState());
        } else {
            scenario.recreate();
        }
        awaitReady();
    }

    @After
    public void closeShell() throws Exception {
        if (scenario != null) {
            try {
                if (ready && !preservePreparedFixture) clearFixture();
            } finally {
                scenario.close();
            }
        }
    }

    private void openShell() throws Exception {
        scenario = ActivityScenario.launch(MainActivity.class);
        awaitReady();
    }

    private void awaitReady() throws Exception {
        long deadline = SystemClock.elapsedRealtime() + 35_000;
        do {
            JSONObject state = state();
            if ("native-feasibility-v1".equals(state.optString("build")) && state.optString("platform").equals("Native bridge: android.")) {
                assertEquals("https://localhost", state.getString("origin"));
                assertTrue("The native asset origin must be secure", state.getBoolean("secure"));
                if (!state.optBoolean("busy", true)) {
                    ready = true;
                    return;
                }
            }
            SystemClock.sleep(200);
        } while (SystemClock.elapsedRealtime() < deadline);
        fail("The packaged native feasibility shell did not become ready");
    }

    private void createFixture() throws Exception {
        clearFixture();
        click("run");
        awaitResult("Fixture created and verified. Restart the app, then run this check again. ");
    }

    private void verifyRestoredFixture() throws Exception {
        click("run");
        // A newly generated fixture must fail this assertion after process restart.
        awaitResult("Stored fixture reopened and verified. ");
    }

    private void clearFixture() throws Exception {
        click("clear");
        awaitResult("Synthetic fixture cleared. Product account data was not accessed.");
    }

    private void awaitResult(String expected) throws Exception {
        long deadline = SystemClock.elapsedRealtime() + 35_000;
        do {
            JSONObject state = state();
            if (!state.optBoolean("busy", true)) {
                String result = state.getString("result");
                assertTrue("Native fixture check did not report the expected outcome: " + result, result.startsWith(expected));
                if (expected.startsWith("Fixture created") || expected.startsWith("Stored fixture")) {
                    assertTrue(result.contains("Web Locks, nonextractable device keys and Matrix WASM encryption passed."));
                    assertTrue(result.endsWith("Service identity: https://0xdmme.app"));
                }
                return;
            }
            SystemClock.sleep(200);
        } while (SystemClock.elapsedRealtime() < deadline);
        fail("Native fixture operation exceeded its deadline");
    }

    private void click(String button) throws Exception {
        assertTrue(Set.of("run", "clear", "expire", "corrupt").contains(button));
        String script = "(() => { const b = document.getElementById('" + button + "'); if (!b || b.disabled) return false; b.click(); return true; })()";
        assertEquals("The fixture action must be available", "true", evaluate(script));
    }

    private JSONObject state() throws Exception {
        String script = "JSON.stringify({build:document.querySelector('main')?.dataset.build,platform:document.getElementById('platform')?.textContent,origin:location.origin,secure:isSecureContext,busy:document.getElementById('run')?.disabled ?? true,result:document.getElementById('result')?.textContent})";
        Object decoded = new JSONTokener(evaluate(script)).nextValue();
        assertTrue("The WebView must return its visible fixture state", decoded instanceof String);
        return new JSONObject((String) decoded);
    }

    private String evaluate(String script) throws Exception {
        CountDownLatch completed = new CountDownLatch(1);
        AtomicReference<String> result = new AtomicReference<>();
        scenario.onActivity(activity -> activity.getBridge().getWebView().evaluateJavascript(script, value -> {
            result.set(value);
            completed.countDown();
        }));
        assertTrue("The WebView did not reply within five seconds", completed.await(5, TimeUnit.SECONDS));
        return result.get();
    }
}
