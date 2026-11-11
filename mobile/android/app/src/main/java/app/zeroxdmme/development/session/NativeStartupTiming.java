package app.zeroxdmme.development.session;

import android.os.SystemClock;
import app.zeroxdmme.development.BuildConfig;
import java.util.Arrays;
import org.json.JSONObject;

/** Activity-local monotonic milestones, with no content, persistence or network IO. */
public final class NativeStartupTiming {
    private final long started = SystemClock.elapsedRealtime();
    private long webView;
    private long document;
    private long documentStarted;
    public void webView() { webView = elapsed(); }
    void documentStarted() { documentStarted = elapsed(); document = 0; }
    void documentCommitted() { document = elapsed(); }
    private long elapsed() { return Math.max(0, SystemClock.elapsedRealtime() - started); }
    JSONObject snapshot(JSONObject input) throws Exception {
        if (!BuildConfig.DEBUG || !BuildConfig.MOBILE_DIAGNOSTICS) throw NativePolicy.failure();
        NativePolicy.exact(input, "milestone");
        if (input.length() != 1) throw NativePolicy.failure();
        String milestone = NativePolicy.text(input, "milestone", 24);
        if (!Arrays.asList("snapshot", "shell-frame", "contacts-frame", "contacts-screen-frame", "conversations-frame").contains(milestone))
            throw NativePolicy.failure();
        return new JSONObject().put("activityMs", elapsed()).put("webViewMs", webView)
            .put("documentMs", document).put("documentStartedMs", documentStarted);
    }
}
