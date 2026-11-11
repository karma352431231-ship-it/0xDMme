package app.zeroxdmme.development.session;

import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebView;
import androidx.webkit.JavaScriptReplyProxy;
import androidx.webkit.WebMessageCompat;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import com.getcapacitor.WebViewListener;
import java.util.Collections;
import java.util.HashSet;
import java.util.Set;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import org.json.JSONObject;

/** Authorizes the current packaged main document before accessing private HTTP.
 * This owns only message admission, document generations and safe wire replies.
 */
public final class NativeSessionChannel extends WebViewListener {
    private final WebView view;
    private final NativeSession session;
    private final NativeViewOnce viewOnce;
    private final NativeFileExport files;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final ThreadPoolExecutor parser = new ThreadPoolExecutor(1, 1, 0, TimeUnit.MILLISECONDS,
        new ArrayBlockingQueue<>(24), work -> {
            Thread thread = new Thread(work, "0xdmme-wire");
            thread.setDaemon(true);
            return thread;
        }, new ThreadPoolExecutor.AbortPolicy());
    // Main-thread owned, including admission released by posted completion.
    private final Set<String> calls = new HashSet<>();
    private long generation;
    private int pending;
    private long characters;
    private String document;
    private boolean committed;
    private boolean closed;

    public NativeSessionChannel(WebView view) {
        this(view, NativeConnectionFactory.create(view.getContext()));
    }

    NativeSessionChannel(WebView view, NativeSession session) {
        this.view = view;
        this.session = session;
        this.viewOnce = new NativeViewOnce(view, session::protectView);
        this.files = new NativeFileExport(view);
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            close();
            return;
        }
        WebViewCompat.addWebMessageListener(view, "ZeroXSession", Collections.singleton("https://localhost"),
            (source, message, origin, isMainFrame, reply) -> receive(message, origin, isMainFrame, reply));
    }

    private boolean local() {
        Uri url = Uri.parse(view.getUrl() == null ? "" : view.getUrl());
        return "https".equals(url.getScheme()) && "localhost".equals(url.getHost()) && url.getPort() == -1
            && url.getUserInfo() == null;
    }

    private void receive(WebMessageCompat message, Uri origin, boolean mainFrame, JavaScriptReplyProxy reply) {
        if (closed || !mainFrame || !"https://localhost".equals(origin.toString()) || !local()) return;
        if (message.getType() != WebMessageCompat.TYPE_STRING) return;
        String data = message.getData();
        if (data == null || data.length() > NativePolicy.WIRE_CHARACTERS || pending >= 24 || characters + data.length() > 22_420_000) {
            close();
            return;
        }
        final long current = generation;
        pending++;
        characters += data.length();
        try {
            parser.execute(() -> parse(data, current, reply));
        } catch (RuntimeException rejected) {
            release(data.length());
            close();
        }
    }

    private void parse(String data, long current, JavaScriptReplyProxy proxy) {
        try {
            NativePolicy.Message message = new NativePolicy.Message(data);
            main.post(() -> authorize(message, data.length(), current, proxy));
        } catch (Exception invalid) {
            main.post(() -> { release(data.length()); if (current == generation) close(); });
        }
    }

    private void authorize(NativePolicy.Message message, int size, long current, JavaScriptReplyProxy proxy) {
        if (closed || current != generation || !local()) { release(size); return; }
        if (!calls.add(message.call)) { release(size); close(); return; }
        NativeSession.Reply reply = reply(message, size, current, proxy);
        view.evaluateJavascript("window.__zeroXSessionDocument", nonce -> {
            if (closed || current != generation || !local()) { reply.failure(); return; }
            if (!JSONObject.quote(message.document).equals(nonce)) { reply.failure(); return; }
            if (!committed) {
                if (message.operation.equals("hello") && message.request.length() == 0) reply.value(false);
                else reply.failure();
                return;
            }
            if (document == null && message.operation.equals("hello")) document = message.document;
            if (!message.document.equals(document)) { reply.failure(); return; }
            dispatch(message, reply);
        });
    }

    private void dispatch(NativePolicy.Message message, NativeSession.Reply reply) {
        try {
            switch (message.operation) {
                case "hello":
                    if (message.request.length() != 0) throw NativePolicy.failure();
                    reply.value(session.ready());
                    break;
                case "open": session.open(message.request, reply); break;
                case "read": session.read(message.request, reply); break;
                case "cancel": session.cancel(message.request, reply); break;
                case "view-begin":
                case "view-append":
                case "view-show":
                case "view-active":
                case "view-close":
                    reply.value(viewOnce.dispatch(message.operation, message.request));
                    break;
                case "view-frame": viewOnce.awaitFrame(message.request, reply); break;
                case "file-begin":
                case "file-append":
                case "file-save":
                case "file-close":
                    reply.value(files.dispatch(message.operation, message.request));
                    break;
                default: reply.failure();
            }
        } catch (Exception invalid) { reply.failure(); }
    }

    private NativeSession.Reply reply(NativePolicy.Message message, int size, long current, JavaScriptReplyProxy proxy) {
        return new NativeSession.Reply() {
            private final java.util.concurrent.atomic.AtomicBoolean sent = new java.util.concurrent.atomic.AtomicBoolean();
            @Override public void value(Object value) { send(value, false); }
            @Override public void failure() { send(null, true); }
            private void send(Object value, boolean failed) {
                if (!sent.compareAndSet(false, true)) return;
                main.post(() -> {
                    release(size);
                    if (current != generation) return;
                    calls.remove(message.call);
                    if (closed || !local()) return;
                    try {
                        JSONObject result = new JSONObject().put("call", message.call);
                        if (failed) result.put("error", true);
                        else result.put("value", value == null ? JSONObject.NULL : value);
                        String wire = result.toString();
                        if (wire.length() > 192_000) { close(); return; }
                        proxy.postMessage(wire);
                    } catch (Exception unavailable) { close(); }
                });
            }
        };
    }

    private void release(int size) { pending--; characters -= size; }

    @Override public void onPageStarted(WebView webView) {
        viewOnce.close();
        files.close();
        generation++;
        committed = false;
        document = null;
        calls.clear();
        session.cancelDocument();
    }

    @Override public void onPageCommitVisible(WebView webView, String url) {
        committed = local() && sameDocument(url, view.getUrl());
        if (committed && app.zeroxdmme.development.BuildConfig.DEBUG && app.zeroxdmme.development.BuildConfig.MOBILE_DIAGNOSTICS)
            view.evaluateJavascript("Object.defineProperty(window,'__0xdmmeNativeDiagnostics',{value:true})", null);
    }

    /** A fragment routes inside this document; path/query changes do not. */
    static boolean sameDocument(String committedUrl, String currentUrl) {
        if (committedUrl == null || currentUrl == null) return false;
        return Uri.parse(committedUrl).buildUpon().fragment(null).build().equals(
            Uri.parse(currentUrl).buildUpon().fragment(null).build());
    }

    @Override public boolean onRenderProcessGone(WebView webView, RenderProcessGoneDetail detail) {
        close();
        return false;
    }

    public void close() {
        if (closed) return;
        closed = true;
        viewOnce.close();
        files.close();
        generation++;
        calls.clear();
        session.close();
        parser.shutdownNow();
    }
    public boolean fileResult(int request, int status, android.content.Intent data) { return files.result(request, status, data); }

    public void suspend() { viewOnce.close(); }
}
