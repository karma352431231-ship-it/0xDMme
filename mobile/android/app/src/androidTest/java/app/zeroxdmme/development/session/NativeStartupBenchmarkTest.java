package app.zeroxdmme.development.session;

import static org.junit.Assert.*;
import static org.junit.Assume.assumeTrue;
import android.os.SystemClock;
import androidx.test.core.app.ActivityScenario;
import androidx.test.platform.app.InstrumentationRegistry;
import app.zeroxdmme.development.MainActivity;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.json.JSONObject;
import org.junit.Test;

/** Explicit local diagnostic run. Visits only the directory and Contacts;
 * never opens a message, consumes view-once media or exports account content. */
public class NativeStartupBenchmarkTest {
    @Test public void startupAndContactsMilestones() throws Exception {
        assumeTrue("Explicit diagnostic run required", "true".equals(
            InstrumentationRegistry.getArguments().getString("startupBenchmark")));
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            await(scenario, "document.readyState !== 'loading'");
            evaluate(scenario, OBSERVE);
            await(scenario, "!!window.__startupBenchmark.boot['conversations-frame']");
            evaluate(scenario, "document.querySelector('a[href=\"/contacts\"]').click()");
            await(scenario, "!!window.__startupBenchmark.boot['contacts-frame'] && !!window.__startupBenchmark.boot['contacts-screen-frame']");
            String value = evaluate(scenario, "JSON.stringify(window.__startupBenchmark)");
            Object decoded = new org.json.JSONTokener(value).nextValue();
            assertTrue(decoded instanceof String);
            JSONObject report = new JSONObject((String) decoded);
            assertTrue(report.getJSONObject("boot").getJSONObject("conversations-frame").getLong("bootActivityMs") > 0);
            android.os.Bundle status = new android.os.Bundle();
            status.putString("stream", "STARTUP_BENCHMARK " + report + "\n");
            InstrumentationRegistry.getInstrumentation().sendStatus(0, status);
            evaluate(scenario, "clearInterval(window.__startupBenchmarkTimer);window.dispatchEvent(new CustomEvent('0xdmme-chat-sync-diagnostic-control',{detail:'stop'}));delete window.__startupBenchmark");
        }
    }
    private static void await(ActivityScenario<MainActivity> scenario, String condition) throws Exception {
        long deadline = SystemClock.elapsedRealtime() + 45_000;
        while (SystemClock.elapsedRealtime() < deadline) {
            if ("true".equals(evaluate(scenario, condition))) return;
            SystemClock.sleep(100);
        }
        fail("Expected a verified diagnostic milestone before the deadline: " + condition + "; " + evaluate(scenario,
            "JSON.stringify({capture:window.__startupBenchmark??null,ready:document.readyState,shell:!!document.getElementById('app-shell'),contactsLink:!!document.querySelector('a[href=\"/contacts\"]')})"));
    }
    private static String evaluate(ActivityScenario<MainActivity> scenario, String script) throws Exception {
        var response = new AtomicReference<String>();
        var ready = new CountDownLatch(1);
        scenario.onActivity(activity -> activity.getBridge().getWebView().evaluateJavascript(script, value -> {
            response.set(value); ready.countDown();
        }));
        assertTrue(ready.await(5, TimeUnit.SECONDS));
        return response.get();
    }
    private static final String OBSERVE = """
        window.__startupBenchmark={boot:{},loads:{},heapStart:performance.memory?.usedJSHeapSize??0,heapEnd:0};
        window.addEventListener('0xdmme-chat-sync-diagnostic-event',event=>{
          const d=event.detail,r=window.__startupBenchmark;if(!r||!d)return;
          if(d.event==='boot'&&['snapshot','shell-frame','conversations-frame','contacts-frame','contacts-screen-frame'].includes(d.bootMilestone)){
            const value={};for(const key of ['bootActivityMs','bootWebViewMs','bootDocumentMs','bootNavigationMs'])
              if(typeof d[key]==='number')value[key]=d[key];
            r.boot[d.bootMilestone]=value;
          }
          if(d.event==='load'&&['app-startup','directory-startup','conversation-list','contacts','contacts-screen'].includes(d.loadKind)){
            const value={};for(const key of ['loadMs','loadStageMs','loadRows','loadBytes'])
              if(typeof d[key]==='number')value[key]=d[key];
            if(['complete','failed','cancelled'].includes(d.loadOutcome))value.outcome=d.loadOutcome;
            r.loads[d.loadKind+':'+d.loadStage]=value;
          }
          r.heapEnd=performance.memory?.usedJSHeapSize??0;
        });
        const request=()=>window.dispatchEvent(new CustomEvent('0xdmme-chat-sync-diagnostic-control',{detail:'start'}));
        request();window.__startupBenchmarkTimer=setInterval(()=>{
          if(Object.keys(window.__startupBenchmark.boot).length)clearInterval(window.__startupBenchmarkTimer);else request();
        },100);
        """;
}
