package app.zeroxdmme.development.session;

import android.content.Context;
import android.graphics.Color;
import android.media.AudioAttributes;
import android.media.MediaPlayer;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.SurfaceHolder;
import android.view.SurfaceView;
import android.widget.FrameLayout;
import java.util.Arrays;

/** Android decoder and controls. The caller owns window/security/navigation;
 * this owner releases its surface, callbacks, decoder and plaintext together. */
final class NativeVideoPlayer extends FrameLayout {
    interface Listener {
        void size(int width, int height);
        void firstFrame();
        void failed();
        void fullscreen();
    }
    private final Handler main = new Handler(Looper.getMainLooper());
    private final SurfaceView surface;
    private final NativeVideoControls controls;
    private final Listener listener;
    private final boolean secure;
    private MediaPlayer player;
    private NativeVideoSource source;
    private boolean prepared;
    private boolean playing = true;
    private boolean closed;
    private boolean rendered;
    private int videoWidth = 16, videoHeight = 9;
    private final Runnable deadline = this::fail;
    private final Runnable progress = new Runnable() {
        @Override public void run() {
            main.removeCallbacks(this);
            if (closed || !prepared) return;
            try { controls.update(player.isPlaying(), player.getCurrentPosition(), player.getDuration()); }
            catch (IllegalStateException invalid) { fail(); return; }
            main.postDelayed(this, 250);
        }
    };

    NativeVideoPlayer(Context context, boolean secure, Listener listener) {
        super(context);
        this.secure = secure;
        this.listener = listener;
        setBackgroundColor(Color.BLACK);
        surface = new SurfaceView(context);
        surface.setSecure(secure);
        addView(surface, new FrameLayout.LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT, Gravity.CENTER));
        controls = new NativeVideoControls(context, this::toggle, this::seek, listener::fullscreen);
        addView(controls, new FrameLayout.LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT, Gravity.BOTTOM));
        surface.getHolder().addCallback(new SurfaceHolder.Callback() {
            @Override public void surfaceCreated(SurfaceHolder holder) {
                if (closed || player == null) return;
                try { player.setDisplay(holder); if (prepared && playing) player.start(); }
                catch (IllegalStateException invalid) { fail(); }
            }
            @Override public void surfaceChanged(SurfaceHolder holder, int format, int width, int height) {}
            @Override public void surfaceDestroyed(SurfaceHolder holder) {
                if (closed || player == null) return;
                try { if (prepared && player.isPlaying()) player.pause(); player.setDisplay(null); }
                catch (IllegalStateException invalid) { fail(); }
            }
        });
    }
    void load(byte[] bytes, String mime) {
        try {
            if (closed || player != null || !(mime.equals("video/mp4") || mime.equals("video/quicktime")))
                throw NativePolicy.failure();
            source = new NativeVideoSource(bytes);
            player = new MediaPlayer();
            AudioAttributes.Builder audio = new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA)
                .setContentType(AudioAttributes.CONTENT_TYPE_MOVIE);
            if (secure && Build.VERSION.SDK_INT >= 29) audio.setAllowedCapturePolicy(AudioAttributes.ALLOW_CAPTURE_BY_NONE);
            player.setAudioAttributes(audio.build());
            player.setOnPreparedListener(value -> ready());
            player.setOnVideoSizeChangedListener((value, width, height) -> size(width, height));
            player.setOnCompletionListener(value -> { if (closed) return; playing = false; controls.update(false, value.getDuration(), value.getDuration()); });
            player.setOnErrorListener((value, what, extra) -> { fail(); return true; });
            player.setOnInfoListener((value, what, extra) -> {
                if (!closed && !rendered && what == MediaPlayer.MEDIA_INFO_VIDEO_RENDERING_START) {
                    rendered = true; listener.firstFrame();
                }
                return false;
            });
            player.setDataSource(source);
            if (surface.getHolder().getSurface().isValid()) player.setDisplay(surface.getHolder());
            player.prepareAsync();
            main.postDelayed(deadline, 15_000);
        } catch (Exception invalid) {
            Arrays.fill(bytes, (byte) 0);
            fail();
        }
    }
    private void ready() {
        if (closed) return;
        main.removeCallbacks(deadline);
        prepared = true;
        controls.setEnabled(true);
        size(player.getVideoWidth(), player.getVideoHeight());
        if (closed) return;
        try { if (surface.getHolder().getSurface().isValid() && playing) player.start(); progress.run(); }
        catch (IllegalStateException invalid) { fail(); }
    }
    private void size(int width, int height) {
        if (closed) return;
        if (width <= 0 || height <= 0 || (long) width * height > 8_400_000) { fail(); return; }
        videoWidth = width; videoHeight = height;
        fit(); listener.size(width, height);
    }
    @Override protected void onSizeChanged(int width, int height, int oldWidth, int oldHeight) {
        super.onSizeChanged(width, height, oldWidth, oldHeight); fit();
    }
    private void fit() {
        int width = getWidth(), height = getHeight();
        if (width <= 0 || height <= 0) return;
        float scale = Math.min(width / (float) videoWidth, height / (float) videoHeight);
        surface.setLayoutParams(new FrameLayout.LayoutParams(Math.max(1, Math.round(videoWidth * scale)),
            Math.max(1, Math.round(videoHeight * scale)), Gravity.CENTER));
    }
    private void toggle() {
        if (closed || !prepared) return;
        try { playing = !player.isPlaying(); if (playing) player.start(); else player.pause(); progress.run(); }
        catch (IllegalStateException invalid) { fail(); }
    }
    private void seek(int position) {
        if (closed || !prepared) return;
        try { player.seekTo((int) (player.getDuration() * (long) position / 1000)); }
        catch (IllegalStateException invalid) { fail(); }
    }
    private void fail() {
        if (closed) return;
        close(); listener.failed();
    }
    void close() {
        if (closed) return;
        closed = true; prepared = false;
        main.removeCallbacksAndMessages(null);
        controls.setEnabled(false);
        if (player != null) { player.setOnErrorListener(null); player.setOnPreparedListener(null); player.setOnInfoListener(null); player.release(); player = null; }
        if (source != null) { source.close(); source = null; }
    }
}
