package app.zeroxdmme.development.session;

import android.os.SystemClock;
import app.zeroxdmme.development.BuildConfig;
import org.json.JSONObject;

/** Optional per-reply durations only. No paths, payloads, keys or wall-clock data. */
final class NativeExchangeTiming {
    private static final boolean ENABLED = BuildConfig.DEBUG && BuildConfig.MOBILE_DIAGNOSTICS;
    static long start() { return ENABLED ? SystemClock.elapsedRealtimeNanos() : 0; }
    static long elapsed(long start) { return ENABLED ? Math.max(0, (SystemClock.elapsedRealtimeNanos() - start) / 1000) : 0; }
    static JSONObject attach(JSONObject value, long receiveUs, long encodeUs) throws Exception {
        if (ENABLED) value.put("timing", new JSONObject().put("receiveUs", receiveUs).put("encodeUs", encodeUs));
        return value;
    }
}
