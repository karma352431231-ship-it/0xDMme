package app.zeroxdmme.development.session;

import android.app.Activity;
import android.app.Dialog;
import android.content.Context;
import android.content.ContextWrapper;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Color;
import android.graphics.ImageDecoder;
import android.graphics.drawable.Animatable;
import android.os.Build;
import android.util.Base64;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.WebView;
import android.widget.ImageView;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import java.nio.charset.StandardCharsets;
import java.nio.ByteBuffer;
import java.util.Arrays;
import java.util.function.Consumer;
import org.json.JSONObject;

/** Plaintext is shown only in a secure native window and is never written to disk. */
final class NativeViewOnce {
    private final WebView source;
    private final Consumer<Boolean> protectedState;
    private Dialog dialog;
    private Activity activity;
    private NativeViewOnceLayout content;
    private Bitmap bitmap;
    private Animatable animation;
    private NativeViewOnceGif legacyGif;
    private NativeViewOnceVideo video;
    private byte[] bytes;
    private String id;
    private String mime;
    private int offset;
    private boolean shown;
    private boolean wasSecure;

    NativeViewOnce(WebView source, Consumer<Boolean> protectedState) {
        this.source = source;
        this.protectedState = protectedState;
    }
    Object dispatch(String operation, JSONObject input) throws Exception {
        if (operation.equals("view-begin")) return begin(input);
        String requested = NativePolicy.identifier(input, "id");
        if (operation.equals("view-active")) {
            NativePolicy.exact(input, "id");
            return requested.equals(id) && dialog != null && dialog.isShowing();
        }
        if (operation.equals("view-close")) {
            NativePolicy.exact(input, "id");
            if (requested.equals(id)) close();
            return true;
        }
        if (!requested.equals(id) || dialog == null || shown) throw NativePolicy.failure();
        if (operation.equals("view-append")) return append(input);
        if (operation.equals("view-show")) return show(input);
        throw NativePolicy.failure();
    }
    private Activity activity() throws Exception {
        Context current = source.getContext();
        while (current instanceof ContextWrapper && !(current instanceof Activity))
            current = ((ContextWrapper) current).getBaseContext();
        if (!(current instanceof Activity)) throw NativePolicy.failure();
        return (Activity) current;
    }
    private int number(JSONObject input, String key, int maximum) throws Exception {
        Object value = input.opt(key);
        if (!(value instanceof Number)) throw NativePolicy.failure();
        Number number = (Number) value;
        int result = number.intValue();
        if (result < 0 || result > maximum || number.doubleValue() != result) throw NativePolicy.failure();
        return result;
    }
    private boolean supported(String type) {
        if (isVideo(type)) return true;
        if (Arrays.asList("text/plain", "image/png", "image/jpeg", "image/gif", "image/webp", "image/bmp").contains(type)) return true;
        if (Arrays.asList("image/heic", "image/heif").contains(type)) return Build.VERSION.SDK_INT >= 28;
        return type.equals("image/avif") && Build.VERSION.SDK_INT >= 31;
    }
    private static boolean isVideo(String type) {
        return type.equals("video/mp4") || type.equals("video/quicktime");
    }
    private boolean begin(JSONObject input) throws Exception {
        NativePolicy.exact(input, "id", "mime", "bytes");
        if (dialog != null) throw NativePolicy.failure();
        String requested = NativePolicy.identifier(input, "id");
        String type = NativePolicy.text(input, "mime", 128);
        int count = number(input, "bytes", 10_000_000);
        if (!supported(type) || (type.equals("text/plain") != (count == 0))) throw NativePolicy.failure();
        Activity owner = activity();
        if (owner.isFinishing() || owner.isDestroyed()) throw NativePolicy.failure();
        activity = owner;
        wasSecure = (owner.getWindow().getAttributes().flags & WindowManager.LayoutParams.FLAG_SECURE) != 0;
        owner.getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
        id = requested; mime = type; bytes = new byte[count]; offset = 0; shown = false;
        Dialog screen = new Dialog(owner, android.R.style.Theme_Material_NoActionBar);
        dialog = screen;
        content = new NativeViewOnceLayout(owner, this::close);
        if (isVideo(type)) video = new NativeViewOnceVideo(content);
        screen.setContentView(content);
        screen.setOnKeyListener((ignored, key, event) ->
            key == android.view.KeyEvent.KEYCODE_BACK &&
            event.getAction() == android.view.KeyEvent.ACTION_UP && content.exitFullscreen());
        screen.setOnDismissListener(ignored -> { if (dialog == screen) dispose(); });
        Window window = screen.getWindow();
        if (window == null) { close(); throw NativePolicy.failure(); }
        window.addFlags(WindowManager.LayoutParams.FLAG_SECURE | WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);
        WindowCompat.setDecorFitsSystemWindows(window, false);
        window.setStatusBarColor(Color.TRANSPARENT);
        window.setNavigationBarColor(Color.TRANSPARENT);
        WindowCompat.getInsetsController(window, content).setAppearanceLightStatusBars(false);
        WindowCompat.getInsetsController(window, content).setAppearanceLightNavigationBars(false);
        content.onFullscreen(active -> {
            var insets = WindowCompat.getInsetsController(window, content);
            insets.setSystemBarsBehavior(androidx.core.view.WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            if (active) insets.hide(WindowInsetsCompat.Type.systemBars());
            else insets.show(WindowInsetsCompat.Type.systemBars());
        });
        ViewCompat.setOnApplyWindowInsetsListener(content, (view, windowInsets) -> {
            var insets = windowInsets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
            view.setPadding(insets.left, insets.top, insets.right, insets.bottom);
            return WindowInsetsCompat.CONSUMED;
        });
        screen.show();
        window.setLayout(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT);
        ViewCompat.requestApplyInsets(content);
        protectedState.accept(true);
        return true;
    }
    private boolean append(JSONObject input) throws Exception {
        NativePolicy.exact(input, "id", "offset", "bytes");
        int next = number(input, "offset", 10_000_000);
        String value = NativePolicy.text(input, "bytes", 90_000);
        byte[] chunk = Base64.decode(value, Base64.NO_WRAP);
        try {
            if (chunk.length == 0 || chunk.length > 65_536 || next != offset ||
                offset + chunk.length > bytes.length || !Base64.encodeToString(chunk, Base64.NO_WRAP).equals(value))
                throw NativePolicy.failure();
            System.arraycopy(chunk, 0, bytes, offset, chunk.length);
            offset += chunk.length;
            return true;
        } finally { Arrays.fill(chunk, (byte) 0); }
    }
    private boolean show(JSONObject input) throws Exception {
        NativePolicy.exact(input, "id", "text");
        String value = NativePolicy.text(input, "text", 16000);
        if (value.getBytes(StandardCharsets.UTF_8).length > 16000 || offset != bytes.length) throw NativePolicy.failure();
        if (video != null) {
            content.showMedia(video, 16, 9, value);
            content.showPlayback(video);
            video.load(bytes);
            bytes = null; // The player wipes the source on close.
        } else if (mime.equals("image/gif") || (mime.equals("image/webp") && Build.VERSION.SDK_INT >= 28)) {
            showAnimated(value);
        } else {
            if (!mime.equals("text/plain")) bitmap = stillImage();
            content.show(bitmap, value);
            Arrays.fill(bytes, (byte) 0);
        }
        shown = true;
        return true;
    }

    private BitmapFactory.Options imageBounds() throws Exception {
        BitmapFactory.Options bounds = new BitmapFactory.Options();
        bounds.inJustDecodeBounds = true;
        BitmapFactory.decodeByteArray(bytes, 0, bytes.length, bounds);
        if (bounds.outWidth <= 0 || bounds.outHeight <= 0) throw NativePolicy.failure();
        return bounds;
    }

    private Bitmap stillImage() throws Exception {
        BitmapFactory.Options bounds = imageBounds();
        int sample = 1;
        while ((long) bounds.outWidth * bounds.outHeight / sample / sample > 8_000_000) sample *= 2;
        BitmapFactory.Options options = new BitmapFactory.Options();
        options.inSampleSize = sample;
        Bitmap result = BitmapFactory.decodeByteArray(bytes, 0, bytes.length, options);
        if (result == null) throw NativePolicy.failure();
        if (result.getAllocationByteCount() > 64 * 1024 * 1024) {
            result.recycle();
            throw NativePolicy.failure();
        }
        return result;
    }

    private void showAnimated(String caption) throws Exception {
        BitmapFactory.Options bounds = imageBounds();
        if ((long) bounds.outWidth * bounds.outHeight > 8_000_000) throw NativePolicy.failure();
        if (Build.VERSION.SDK_INT < 28) {
            legacyGif = new NativeViewOnceGif(activity, bytes);
            content.showMedia(legacyGif, legacyGif.width(), legacyGif.height(), caption);
            return;
        }
        var source = ImageDecoder.createSource(ByteBuffer.wrap(bytes));
        var drawable = ImageDecoder.decodeDrawable(source, (decoder, info, input) -> {
            int longest = Math.max(info.getSize().getWidth(), info.getSize().getHeight());
            if (longest > 2048) decoder.setTargetSampleSize((longest + 2047) / 2048);
        });
        ImageView image = new ImageView(activity);
        image.setContentDescription("View-once image");
        image.setImageDrawable(drawable);
        image.setScaleType(ImageView.ScaleType.FIT_CENTER);
        content.showMedia(image, drawable.getIntrinsicWidth(), drawable.getIntrinsicHeight(), caption);
        if (drawable instanceof Animatable moving) {
            animation = moving;
            moving.start();
        }
    }

    private void dispose() {
        protectedState.accept(false);
        if (video != null) video.close();
        if (animation != null) animation.stop();
        if (legacyGif != null) legacyGif.close();
        if (content != null) content.erase();
        if (bytes != null) Arrays.fill(bytes, (byte) 0);
        if (bitmap != null) bitmap.recycle();
        if (activity != null && !wasSecure) activity.getWindow().clearFlags(WindowManager.LayoutParams.FLAG_SECURE);
        dialog = null; content = null; bitmap = null; bytes = null; activity = null; id = null; mime = null;
        video = null; animation = null; legacyGif = null;
        offset = 0; shown = false;
    }
    void close() {
        Dialog previous = dialog;
        if (previous != null) previous.dismiss();
        if (dialog == previous) dispose();
    }
}
