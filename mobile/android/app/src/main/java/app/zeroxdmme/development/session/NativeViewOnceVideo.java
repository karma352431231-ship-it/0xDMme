package app.zeroxdmme.development.session;

import android.media.AudioAttributes;
import android.media.MediaDataSource;
import android.media.MediaPlayer;
import android.os.Build;
import android.view.SurfaceHolder;
import android.view.SurfaceView;
import java.util.Arrays;

/** Memory-backed playback in the dialog's secure surface. */
final class NativeViewOnceVideo extends SurfaceView implements SurfaceHolder.Callback {
    private final NativeViewOnceLayout layout;
    private MediaPlayer player;
    private VideoBytes source;
    private byte[] bytes;
    private boolean ready;
    private boolean surfaceReady;
    private boolean ended;
    private boolean resume = true;

    NativeViewOnceVideo(NativeViewOnceLayout layout) {
        super(layout.getContext());
        this.layout = layout;
        setSecure(true);
        setContentDescription("View-once video");
        getHolder().addCallback(this);
    }

    void load(byte[] bytes) {
        this.bytes = bytes;
        source = new VideoBytes(bytes);
        prepare();
    }

    private void prepare() {
        if (player != null || source == null || !surfaceReady) return;
        MediaPlayer next = new MediaPlayer();
        player = next;
        try {
            AudioAttributes.Builder audio = new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_MEDIA)
                .setContentType(AudioAttributes.CONTENT_TYPE_MOVIE);
            if (Build.VERSION.SDK_INT >= 29)
                audio.setAllowedCapturePolicy(AudioAttributes.ALLOW_CAPTURE_BY_NONE);
            next.setAudioAttributes(audio.build());
            next.setDataSource(source);
            next.setDisplay(getHolder());
            next.setOnPreparedListener(value -> {
                if (player != value) return;
                if (value.getVideoWidth() <= 0 || value.getVideoHeight() <= 0 ||
                    (long) value.getVideoWidth() * value.getVideoHeight() > 8_400_000) {
                    fail();
                    return;
                }
                ready = true;
                layout.setMediaSize(value.getVideoWidth(), value.getVideoHeight());
                if (surfaceReady && resume) value.start();
                layout.updatePlayback(surfaceReady && resume);
            });
            next.setOnVideoSizeChangedListener((value, width, height) -> {
                if (player == value && width > 0 && height > 0) layout.setMediaSize(width, height);
            });
            next.setOnCompletionListener(value -> {
                if (player != value) return;
                ended = true;
                layout.updatePlayback(false);
            });
            next.setOnErrorListener((value, what, extra) -> {
                if (player == value) fail();
                return true;
            });
            next.prepareAsync();
        } catch (Exception unavailable) {
            fail();
        }
    }

    void toggle() {
        if (!ready || !surfaceReady || player == null) return;
        if (player.isPlaying()) {
            player.pause();
            resume = false;
        } else {
            if (ended) {
                // Some MediaDataSource implementations cannot seek after EOS.
                // Start a new decoder over the same viewer-owned memory.
                releasePlayer();
                source = new VideoBytes(bytes);
                ended = false;
                resume = true;
                prepare();
                return;
            }
            ended = false;
            resume = true;
            player.start();
        }
        layout.updatePlayback(player.isPlaying());
    }

    @Override public void surfaceCreated(SurfaceHolder holder) {
        surfaceReady = true;
        if (player == null) prepare();
        else {
            player.setDisplay(holder);
            if (ready && resume && !ended) player.start();
        }
    }

    @Override public void surfaceChanged(SurfaceHolder holder, int format, int width, int height) {}

    @Override public void surfaceDestroyed(SurfaceHolder holder) {
        surfaceReady = false;
        if (player == null) return;
        if (ready && player.isPlaying()) player.pause();
        player.setDisplay(null);
    }

    private void fail() {
        close();
        layout.show(null, "Could not play this video.");
    }

    void close() {
        releasePlayer();
        if (bytes != null) Arrays.fill(bytes, (byte) 0);
        bytes = null;
    }

    private void releasePlayer() {
        MediaPlayer old = player;
        player = null;
        ready = false;
        if (old != null) old.release();
        if (source != null) source.close();
        source = null;
    }

    private static final class VideoBytes extends MediaDataSource {
        private byte[] data;

        VideoBytes(byte[] data) { this.data = data; }

        @Override public synchronized int readAt(long position, byte[] target, int offset, int count) {
            if (count == 0) return 0;
            if (data == null || position < 0 || position >= data.length) return -1;
            int amount = Math.min(count, data.length - (int) position);
            System.arraycopy(data, (int) position, target, offset, amount);
            return amount;
        }

        @Override public synchronized long getSize() { return data == null ? 0 : data.length; }

        @Override public synchronized void close() {
            // Decoder disposal must not erase a still-open viewer's source.
            // The viewer owner wipes the bytes when the view closes.
            data = null;
        }
    }
}
