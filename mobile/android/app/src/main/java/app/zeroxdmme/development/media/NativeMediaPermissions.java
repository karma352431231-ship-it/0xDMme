package app.zeroxdmme.development.media;

import android.Manifest;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.webkit.PermissionRequest;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebView;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import com.getcapacitor.Bridge;
import com.getcapacitor.WebViewListener;
import java.util.LinkedHashSet;
import java.util.Set;
import java.util.function.Supplier;

/** Owns one bounded media-permission operation for the packaged product document.
 * OS permission is requested only in response to the product's media request.
 * This owner never captures media or exposes a permission API to JavaScript.
 */
public final class NativeMediaPermissions extends WebViewListener {
    interface Prompt {
        boolean granted(String permission);
        void launch(String[] permissions);
        void close();
    }

    private final Supplier<String> document;
    private final Prompt prompt;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final Runnable timeout = () -> finish(false);
    private PermissionRequest pending;
    private String[] resources;
    private String[] permissions;
    private boolean waitingForOs;
    private boolean closed;

    public NativeMediaPermissions(Bridge bridge, WebView view) {
        document = view::getUrl;
        prompt = new AndroidPrompt(bridge);
    }

    NativeMediaPermissions(Supplier<String> document, Prompt prompt) {
        this.document = document;
        this.prompt = prompt;
    }

    public void request(PermissionRequest request) {
        if (!admissible(request)) {
            request.deny();
            return;
        }
        String[] requested = request.getResources();
        String[] required = permissionsFor(requested);
        if (required == null) {
            request.deny();
            return;
        }
        pending = request;
        resources = requested.clone();
        permissions = required;
        if (allGranted()) {
            finish(true);
            return;
        }
        requestOs();
    }

    private boolean admissible(PermissionRequest request) {
        return !closed && pending == null && !waitingForOs && trusted(request.getOrigin()) && localDocument();
    }

    private static String[] permissionsFor(String[] requested) {
        if (requested == null || requested.length < 1 || requested.length > 2) {
            return null;
        }
        Set<String> required = new LinkedHashSet<>();
        for (String resource : requested) {
            String permission = permission(resource);
            if (permission == null || !required.add(permission)) return null;
        }
        return required.toArray(new String[0]);
    }

    private void requestOs() {
        waitingForOs = true;
        main.postDelayed(timeout, 30_000);
        try {
            prompt.launch(permissions.clone());
        } catch (RuntimeException unavailable) {
            waitingForOs = false;
            finish(false);
        }
    }

    private static String permission(String resource) {
        if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(resource)) return Manifest.permission.RECORD_AUDIO;
        if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(resource)) return Manifest.permission.CAMERA;
        return null;
    }

    private static boolean trusted(Uri origin) {
        if (origin == null) return false;
        String path = origin.getPath();
        return "https".equals(origin.getScheme()) && "localhost".equals(origin.getHost()) && origin.getPort() == -1
            && origin.getUserInfo() == null && origin.getQuery() == null && origin.getFragment() == null
            && (path == null || path.isEmpty() || path.equals("/"));
    }

    private boolean localDocument() {
        String url = document.get();
        if (url == null) return false;
        Uri parsed = Uri.parse(url);
        String path = parsed.getPath();
        return "https".equals(parsed.getScheme()) && "localhost".equals(parsed.getHost()) && parsed.getPort() == -1
            && parsed.getUserInfo() == null && parsed.getQuery() == null
            && ("/".equals(path) || "/index.html".equals(path));
    }

    private boolean allGranted() {
        if (permissions == null) return false;
        for (String permission : permissions) if (!prompt.granted(permission)) return false;
        return true;
    }

    void permissionResult() {
        waitingForOs = false;
        if (pending != null) finish(!closed && allGranted());
    }

    private void finish(boolean allowed) {
        PermissionRequest request = pending;
        String[] approved = resources;
        clear();
        if (request == null) return;
        if (allowed && !closed && localDocument()) request.grant(approved);
        else request.deny();
    }

    private void clear() {
        main.removeCallbacks(timeout);
        pending = null;
        resources = null;
        permissions = null;
    }

    public void cancel(PermissionRequest request) {
        if (pending == request) clear();
        // Keep the OS-result slot occupied until its callback arrives: a late
        // result must never authorize a different document's new request.
    }

    public void suspend() { finish(false); }
    @Override public void onPageStarted(WebView view) { suspend(); }
    @Override public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
        close();
        return false;
    }

    public void close() {
        if (closed) return;
        closed = true;
        finish(false);
        prompt.close();
    }

    private final class AndroidPrompt implements Prompt {
        private final Bridge bridge;
        private final ActivityResultLauncher<String[]> launcher;
        AndroidPrompt(Bridge bridge) {
            this.bridge = bridge;
            launcher = bridge.registerForActivityResult(new ActivityResultContracts.RequestMultiplePermissions(), result -> permissionResult());
        }
        @Override public boolean granted(String permission) {
            return bridge.getContext().checkSelfPermission(permission) == PackageManager.PERMISSION_GRANTED;
        }
        @Override public void launch(String[] permissions) { launcher.launch(permissions); }
        @Override public void close() { launcher.unregister(); }
    }
}
