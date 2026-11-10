package app.zeroxdmme.development.session;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Movie;
import android.os.SystemClock;
import android.view.View;

/** Animated GIF fallback on Android versions before ImageDecoder. */
final class NativeViewOnceGif extends View {
    private Movie movie;
    private final long start = SystemClock.uptimeMillis();

    NativeViewOnceGif(Context context, byte[] bytes) throws Exception {
        super(context);
        movie = Movie.decodeByteArray(bytes, 0, bytes.length);
        if (movie == null || movie.width() <= 0 || movie.height() <= 0) throw NativePolicy.failure();
        setLayerType(LAYER_TYPE_SOFTWARE, null);
        setContentDescription("View-once image");
    }

    int width() { return movie.width(); }
    int height() { return movie.height(); }

    @Override protected void onDraw(Canvas canvas) {
        super.onDraw(canvas);
        if (movie == null) return;
        int duration = Math.max(movie.duration(), 100);
        movie.setTime((int) ((SystemClock.uptimeMillis() - start) % duration));
        int save = canvas.save();
        canvas.scale(getWidth() / (float) movie.width(), getHeight() / (float) movie.height());
        movie.draw(canvas, 0, 0);
        canvas.restoreToCount(save);
        postInvalidateOnAnimation();
    }

    void close() { movie = null; }
}
