package app.zeroxdmme.development.session;

import android.os.SystemClock;
import android.view.View;
import android.view.ViewTreeObserver;
import app.zeroxdmme.development.BuildConfig;
import org.json.JSONObject;

/** Main-thread, metadata-only timing for the explicit diagnostic APK. */
final class NativeViewOnceTiming {
    private View target;
    private ViewTreeObserver.OnDrawListener listener;
    private long started;
    private long elapsed;
    private String state = "unavailable";
    private long generation;
    private final android.os.Handler main = new android.os.Handler(android.os.Looper.getMainLooper());
    private NativeSession.Reply waiting;
    private final Runnable timeout = () -> {
        if (state.equals("waiting")) state = "timeout";
        complete();
    };

    void start(View view, boolean video) {
        close();
        if (!BuildConfig.DEBUG || !BuildConfig.MOBILE_DIAGNOSTICS) return;
        started = SystemClock.elapsedRealtime();
        state = "waiting";
        if (video) return;
        target = view;
        long current = generation;
        listener = () -> {
            mark("native-draw");
            view.post(() -> { if (current == generation) detach(); });
        };
        view.getViewTreeObserver().addOnDrawListener(listener);
    }

    void videoFrame() { mark("video-frame"); }

    private void mark(String phase) {
        if (!state.equals("waiting")) return;
        state = phase;
        elapsed = SystemClock.elapsedRealtime() - started;
        complete();
    }

    void awaitFrame(NativeSession.Reply reply) {
        if (!state.equals("waiting")) { waiting = reply; complete(); return; }
        if (waiting != null) { reply.failure(); return; }
        waiting = reply;
        main.postDelayed(timeout, 10000);
    }

    private void complete() {
        main.removeCallbacks(timeout);
        NativeSession.Reply reply = waiting;
        waiting = null;
        if (reply != null) {
            try { reply.value(snapshot()); }
            catch (Exception unavailable) { reply.failure(); }
        }
    }

    JSONObject snapshot() throws Exception {
        return new JSONObject().put("state", state).put("elapsedMs", elapsed);
    }

    private void detach() {
        if (target != null && listener != null && target.getViewTreeObserver().isAlive())
            target.getViewTreeObserver().removeOnDrawListener(listener);
        target = null;
        listener = null;
    }

    void close() {
        generation++;
        detach();
        state = "unavailable";
        elapsed = 0;
        complete();
    }
}
