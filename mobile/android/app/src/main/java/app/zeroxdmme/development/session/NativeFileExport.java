package app.zeroxdmme.development.session;

import android.app.Activity;
import android.content.Context;
import android.content.ContextWrapper;
import android.content.Intent;
import android.os.Handler;
import android.os.Looper;
import android.util.Base64;
import android.webkit.WebView;
import android.widget.Toast;
import java.io.OutputStream;
import java.util.Arrays;
import org.json.JSONObject;

/** One bounded in-memory download, written only to the user's chosen destination. */
final class NativeFileExport {
    private static final int PICK_FILE = 64510;
    private final WebView view;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final Runnable timeout = this::close;
    private String id;
    private String name;
    private byte[] bytes;
    private int offset;
    private boolean choosing;

    NativeFileExport(WebView view) { this.view = view; }
    private Activity activity() throws Exception {
        Context context = view.getContext();
        while (context instanceof ContextWrapper && !(context instanceof Activity))
            context = ((ContextWrapper) context).getBaseContext();
        if (!(context instanceof Activity)) throw NativePolicy.failure();
        return (Activity) context;
    }
    boolean dispatch(String operation, JSONObject input) throws Exception {
        String requested = NativePolicy.identifier(input, "id");
        if (operation.equals("file-begin")) {
            NativePolicy.exact(input, "id", "name", "bytes");
            if (input.length() != 3 || id != null) throw NativePolicy.failure();
            String title = NativePolicy.text(input, "name", 255);
            if (title.isEmpty() || title.matches(".*[\\x00-\\x1f\\x7f/\\\\].*")) throw NativePolicy.failure();
            int size = NativePolicy.integer(input, "bytes", 1, 10_000_000);
            activity();
            bytes = new byte[size]; id = requested; name = title; offset = 0;
            main.postDelayed(timeout, 600_000);
            return true;
        }
        if (operation.equals("file-close")) {
            NativePolicy.exact(input, "id");
            if (input.length() != 1) throw NativePolicy.failure();
            if (requested.equals(id)) close();
            return true;
        }
        if (!requested.equals(id) || choosing) throw NativePolicy.failure();
        if (operation.equals("file-append")) {
            NativePolicy.exact(input, "id", "offset", "bytes");
            if (input.length() != 3 || NativePolicy.integer(input, "offset", 0, bytes.length) != offset)
                throw NativePolicy.failure();
            String encoded = NativePolicy.text(input, "bytes", 90_000);
            byte[] chunk = Base64.decode(encoded, Base64.NO_WRAP);
            try {
                if (chunk.length == 0 || chunk.length > 65_536 || offset + chunk.length > bytes.length ||
                    !Base64.encodeToString(chunk, Base64.NO_WRAP).equals(encoded)) throw NativePolicy.failure();
                System.arraycopy(chunk, 0, bytes, offset, chunk.length);
                offset += chunk.length;
            } finally { Arrays.fill(chunk, (byte) 0); }
            return true;
        }
        if (!operation.equals("file-save")) throw NativePolicy.failure();
        NativePolicy.exact(input, "id");
        if (input.length() != 1 || offset != bytes.length) throw NativePolicy.failure();
        Intent picker = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        picker.addCategory(Intent.CATEGORY_OPENABLE);
        picker.setType("application/octet-stream");
        picker.putExtra(Intent.EXTRA_TITLE, name);
        activity().startActivityForResult(picker, PICK_FILE);
        choosing = true;
        return true;
    }
    boolean result(int request, int status, Intent data) {
        if (request != PICK_FILE) return false;
        byte[] content = bytes;
        bytes = null;
        boolean save = choosing && status == Activity.RESULT_OK && data != null && data.getData() != null;
        close();
        if (content == null) return true;
        if (!save) { Arrays.fill(content, (byte) 0); return true; }
        android.net.Uri destination = data.getData();
        Thread writer = new Thread(() -> {
            try (OutputStream output = view.getContext().getContentResolver().openOutputStream(destination, "w")) {
                if (output == null) throw NativePolicy.failure();
                output.write(content);
                output.flush();
            } catch (Exception failure) {
                main.post(() -> Toast.makeText(view.getContext(), "The file could not be saved.", Toast.LENGTH_LONG).show());
            } finally { Arrays.fill(content, (byte) 0); }
        }, "0xdmme-file-download");
        writer.start();
        return true;
    }
    void close() {
        main.removeCallbacks(timeout);
        if (bytes != null) Arrays.fill(bytes, (byte) 0);
        bytes = null; id = null; name = null; offset = 0; choosing = false;
    }
}
