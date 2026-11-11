package app.zeroxdmme.development.session;

import android.widget.FrameLayout;
import app.zeroxdmme.development.R;

/** Protected presentation delegates decoding to the shared memory-only player.
 * The view-once owner retains its secure window, opening policy and teardown. */
final class NativeViewOnceVideo extends FrameLayout {
    private final NativeViewOnceLayout layout;
    private final NativeVideoPlayer player;
    private NativeViewOnceWebVideo compatibility;
    private boolean fullscreen;
    private boolean closed;
    private Runnable firstFrame = () -> {};
    NativeViewOnceVideo(NativeViewOnceLayout layout) {
        super(layout.getContext());
        this.layout = layout;
        player = new NativeVideoPlayer(getContext(), true, new NativeVideoPlayer.Listener() {
            @Override public void size(int width, int height) { layout.setMediaSize(width, height); }
            @Override public void firstFrame() { firstFrame.run(); }
            @Override public void failed() {
                exitFullscreen();
                layout.show(null, getContext().getString(R.string.video_failed));
            }
            @Override public void fullscreen() { enterFullscreen(); }
        });
        addView(player, new FrameLayout.LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT));
    }
    void onFirstFrame(Runnable callback) { firstFrame = callback; }
    void load(byte[] bytes, String mime) {
        if (mime.equals("video/quicktime")) {
            // Preserve the existing protected MOV playback on Android variants
            // that cannot decode every QuickTime track in MediaPlayer.
            removeView(player);
            player.close();
            compatibility = new NativeViewOnceWebVideo(layout);
            compatibility.onFirstFrame(() -> firstFrame.run());
            addView(compatibility, new FrameLayout.LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT));
            compatibility.load(bytes, mime);
            return;
        }
        player.load(bytes, mime);
    }
    private void enterFullscreen() {
        if (fullscreen) { exitFullscreen(); return; }
        if (closed) return;
        fullscreen = true;
        removeView(player);
        layout.showVideoFullscreen(player, this::exitFullscreen);
    }
    private void exitFullscreen() {
        if (!fullscreen) return;
        fullscreen = false;
        layout.hideVideoFullscreen(player);
        if (!closed) addView(player, new FrameLayout.LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT));
    }
    void close() {
        if (closed) return;
        closed = true;
        firstFrame = () -> {};
        player.close();
        if (compatibility != null) compatibility.close();
        compatibility = null;
        exitFullscreen();
        removeAllViews();
    }
}
