package app.zeroxdmme.development.session;

import android.app.Activity;
import android.app.Dialog;
import android.content.Context;
import android.content.ContextWrapper;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Color;
import android.os.Build;
import android.util.Base64;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.WebView;
import android.widget.Button;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.function.Consumer;
import org.json.JSONObject;

/** Plaintext is shown only in a secure native window and is never written to disk. */
final class NativeViewOnce {
    private final WebView source;
    private final Consumer<Boolean> protectedState;
    private Dialog dialog;
    private Activity activity;
    private LinearLayout content;
    private Bitmap bitmap;
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
        if (Arrays.asList("text/plain", "image/png", "image/jpeg", "image/gif", "image/webp", "image/bmp").contains(type)) return true;
        if (Arrays.asList("image/heic", "image/heif").contains(type)) return Build.VERSION.SDK_INT >= 28;
        return type.equals("image/avif") && Build.VERSION.SDK_INT >= 31;
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
        LinearLayout layout = new LinearLayout(owner);
        layout.setOrientation(LinearLayout.VERTICAL);
        layout.setBackgroundColor(Color.BLACK);
        Button close = new Button(owner);
        close.setText("Close");
        close.setContentDescription("Close view-once message");
        close.setOnClickListener(view -> screen.dismiss());
        layout.addView(close, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        ScrollView scroll = new ScrollView(owner);
        content = new LinearLayout(owner);
        content.setOrientation(LinearLayout.VERTICAL);
        scroll.addView(content);
        layout.addView(scroll, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1));
        TextView loading = text("Loading…");
        content.addView(loading);
        screen.setContentView(layout);
        screen.setOnDismissListener(ignored -> { if (dialog == screen) dispose(); });
        Window window = screen.getWindow();
        if (window == null) { close(); throw NativePolicy.failure(); }
        window.addFlags(WindowManager.LayoutParams.FLAG_SECURE);
        screen.show();
        window.setLayout(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT);
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
    private TextView text(String value) {
        TextView label = new TextView(activity);
        label.setText(value);
        label.setTextColor(Color.WHITE);
        label.setTextSize(18);
        label.setPadding(20, 20, 20, 20);
        label.setTextIsSelectable(false);
        label.setLongClickable(false);
        return label;
    }
    private boolean show(JSONObject input) throws Exception {
        NativePolicy.exact(input, "id", "text");
        String value = NativePolicy.text(input, "text", 16000);
        if (value.getBytes(StandardCharsets.UTF_8).length > 16000 || offset != bytes.length) throw NativePolicy.failure();
        content.removeAllViews();
        if (!mime.equals("text/plain")) {
            BitmapFactory.Options bounds = new BitmapFactory.Options();
            bounds.inJustDecodeBounds = true;
            BitmapFactory.decodeByteArray(bytes, 0, bytes.length, bounds);
            if (bounds.outWidth <= 0 || bounds.outHeight <= 0) throw NativePolicy.failure();
            int sample = 1;
            while ((long) bounds.outWidth * bounds.outHeight / sample / sample > 8_000_000) sample *= 2;
            BitmapFactory.Options options = new BitmapFactory.Options();
            options.inSampleSize = sample;
            bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.length, options);
            if (bitmap == null || bitmap.getAllocationByteCount() > 64 * 1024 * 1024) throw NativePolicy.failure();
            ImageView image = new ImageView(activity);
            image.setImageBitmap(bitmap);
            image.setAdjustViewBounds(true);
            image.setContentDescription("View-once image");
            content.addView(image, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        }
        if (!value.isEmpty()) content.addView(text(value));
        Arrays.fill(bytes, (byte) 0);
        shown = true;
        return true;
    }
    private void dispose() {
        protectedState.accept(false);
        if (bytes != null) Arrays.fill(bytes, (byte) 0);
        if (content != null) content.removeAllViews();
        if (bitmap != null) bitmap.recycle();
        if (activity != null && !wasSecure) activity.getWindow().clearFlags(WindowManager.LayoutParams.FLAG_SECURE);
        dialog = null; content = null; bitmap = null; bytes = null; activity = null; id = null; mime = null;
        offset = 0; shown = false;
    }
    void close() {
        Dialog previous = dialog;
        if (previous != null) previous.dismiss();
        if (dialog == previous) dispose();
    }
}
