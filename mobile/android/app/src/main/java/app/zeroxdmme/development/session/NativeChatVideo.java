package app.zeroxdmme.development.session;

import android.app.Activity;
import android.app.Dialog;
import android.content.Context;
import android.content.ContextWrapper;
import android.content.pm.ActivityInfo;
import android.graphics.Color;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.ViewGroup;
import android.webkit.WebView;
import android.widget.FrameLayout;
import android.widget.ImageButton;
import android.widget.TextView;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import app.zeroxdmme.development.R;
import java.util.Arrays;
import org.json.JSONObject;

/** Replayable chat video presentation, separate from the single-use capability.
 * One bounded memory buffer, one dialog and one decoder; never disk or a URL. */
final class NativeChatVideo {
    private final WebView source;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final NativeViewOnceTiming timing = new NativeViewOnceTiming();
    private Activity activity;
    private Dialog dialog;
    private NativeVideoPlayer player;
    private byte[] bytes;
    private String id, mime;
    private int offset, previousOrientation;
    private int videoWidth = 16, videoHeight = 9;
    private boolean shown, fullscreen, failed;
    NativeChatVideo(WebView source) { this.source = source; }
    boolean active() { return dialog != null; }
    Object dispatch(String operation, JSONObject input) throws Exception {
        if (operation.equals("video-begin")) return begin(input);
        String requested = NativePolicy.identifier(input, "id");
        if (operation.equals("video-active") || operation.equals("video-close")) {
            NativePolicy.exact(input, "id");
            if (operation.equals("video-active")) {
                if (!requested.equals(id) || !active()) return "closed";
                return failed ? "failed" : "open";
            }
            if (requested.equals(id)) close();
            return true;
        }
        if (!requested.equals(id) || !active() || shown) throw NativePolicy.failure();
        if (operation.equals("video-append")) {
            byte[] chunk = NativePolicy.mediaChunk(input, offset, bytes.length - offset);
            try { System.arraycopy(chunk, 0, bytes, offset, chunk.length); offset += chunk.length; }
            finally { Arrays.fill(chunk, (byte) 0); }
            return true;
        }
        if (!operation.equals("video-show")) throw NativePolicy.failure();
        NativePolicy.exact(input, "id");
        if (offset != bytes.length) throw NativePolicy.failure();
        shown = true;
        main.removeCallbacksAndMessages(null);
        timing.start(player, true);
        player.load(bytes, mime);
        bytes = null;
        return true;
    }
    void awaitFrame(JSONObject input, NativeSession.Reply reply) throws Exception {
        NativePolicy.exact(input, "id");
        if (!app.zeroxdmme.development.BuildConfig.DEBUG || !app.zeroxdmme.development.BuildConfig.MOBILE_DIAGNOSTICS)
            throw NativePolicy.failure();
        if (!NativePolicy.identifier(input, "id").equals(id))
            reply.value(new JSONObject().put("state", "unavailable").put("elapsedMs", 0));
        else timing.awaitFrame(reply);
    }
    private boolean begin(JSONObject input) throws Exception {
        NativePolicy.exact(input, "id", "mime", "bytes");
        if (active()) throw NativePolicy.failure();
        String requested = NativePolicy.identifier(input, "id"), type = NativePolicy.text(input, "mime", 128);
        int count = NativePolicy.integer(input, "bytes", 1, 10_000_000);
        if (!type.equals("video/mp4") && !type.equals("video/quicktime")) throw NativePolicy.failure();
        Context context = source.getContext();
        while (context instanceof ContextWrapper && !(context instanceof Activity)) context = ((ContextWrapper) context).getBaseContext();
        if (!(context instanceof Activity owner) || owner.isFinishing() || owner.isDestroyed()) throw NativePolicy.failure();
        activity = owner; previousOrientation = owner.getRequestedOrientation();
        id = requested; mime = type; offset = 0; shown = false; bytes = new byte[count];
        try {
            FrameLayout content = new FrameLayout(owner);
            content.setBackgroundColor(Color.BLACK);
            ImageButton back = back(owner);
            player = new NativeVideoPlayer(owner, false, new NativeVideoPlayer.Listener() {
                @Override public void size(int width, int height) { videoWidth = width; videoHeight = height; }
                @Override public void firstFrame() { timing.videoFrame(); }
                @Override public void fullscreen() { toggleFullscreen(); }
                @Override public void failed() {
                    failed = true;
                    timing.close();
                    TextView error = new TextView(owner);
                    error.setText(R.string.video_failed); error.setTextColor(Color.WHITE); error.setGravity(Gravity.CENTER);
                    content.addView(error, new FrameLayout.LayoutParams(-1, -1)); back.bringToFront();
                }
            });
            content.addView(player, new FrameLayout.LayoutParams(-1, -1));
            int touch = Math.round(48 * owner.getResources().getDisplayMetrics().density);
            content.addView(back, new FrameLayout.LayoutParams(touch, touch, Gravity.TOP | Gravity.START));
            Dialog screen = new Dialog(owner, android.R.style.Theme_Material_NoActionBar);
            dialog = screen; screen.setContentView(content);
            screen.setOnDismissListener(ignored -> { if (dialog == screen) dispose(); });
            screen.setOnKeyListener((ignored, key, event) -> {
                if (key != android.view.KeyEvent.KEYCODE_BACK || event.getAction() != android.view.KeyEvent.ACTION_UP || !fullscreen) return false;
                toggleFullscreen(); return true;
            });
            var window = screen.getWindow();
            if (window == null) throw NativePolicy.failure();
            WindowCompat.setDecorFitsSystemWindows(window, false);
            window.setStatusBarColor(Color.BLACK); window.setNavigationBarColor(Color.BLACK);
            ViewCompat.setOnApplyWindowInsetsListener(content, (view, insets) -> {
                var bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
                view.setPadding(bars.left, bars.top, bars.right, bars.bottom); return WindowInsetsCompat.CONSUMED;
            });
            screen.show(); window.setLayout(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT);
            ViewCompat.requestApplyInsets(content);
            main.postDelayed(this::close, 45_000);
            return true;
        } catch (Exception failure) { close(); throw failure; }
    }
    private ImageButton back(Activity owner) {
        ImageButton back = new ImageButton(owner);
        back.setImageResource(R.drawable.view_once_back); back.setColorFilter(Color.WHITE);
        back.setBackgroundColor(0x99000000); back.setContentDescription(owner.getString(R.string.video_close));
        back.setOnClickListener(view -> close());
        return back;
    }
    private void toggleFullscreen() {
        if (!active()) return;
        fullscreen = !fullscreen;
        activity.setRequestedOrientation(fullscreen ? (videoWidth >= videoHeight ? ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
            : ActivityInfo.SCREEN_ORIENTATION_SENSOR_PORTRAIT) : previousOrientation);
        var insets = WindowCompat.getInsetsController(dialog.getWindow(), dialog.getWindow().getDecorView());
        insets.setSystemBarsBehavior(androidx.core.view.WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
        if (fullscreen) insets.hide(WindowInsetsCompat.Type.systemBars()); else insets.show(WindowInsetsCompat.Type.systemBars());
    }
    void close() {
        Dialog previous = dialog;
        if (previous != null) previous.dismiss();
        if (dialog == previous) dispose();
    }
    private void dispose() {
        main.removeCallbacksAndMessages(null); timing.close();
        if (player != null) player.close();
        if (bytes != null) Arrays.fill(bytes, (byte) 0);
        if (activity != null) activity.setRequestedOrientation(previousOrientation);
        dialog = null; activity = null; player = null; bytes = null; id = null; mime = null;
        offset = 0; shown = false; fullscreen = false; failed = false;
        videoWidth = 16; videoHeight = 9;
    }
}
