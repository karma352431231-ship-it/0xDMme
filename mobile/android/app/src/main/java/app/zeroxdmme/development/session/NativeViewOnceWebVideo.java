package app.zeroxdmme.development.session;

import android.content.Context;
import android.graphics.Color;
import android.media.AudioAttributes;
import android.media.AudioManager;
import android.os.Build;
import android.util.Base64;
import android.view.View;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import androidx.webkit.WebMessageCompat;
import androidx.webkit.WebViewCompat;
import java.io.ByteArrayInputStream;
import java.security.SecureRandom;
import java.util.Arrays;
import java.util.Collections;
import org.json.JSONObject;

/** The feed's HTML video controls, isolated inside the secure native dialog.
 * All media is a memory-only data URL. This WebView has no account bridge,
 * storage, file access, navigation or network access. */
final class NativeViewOnceWebVideo extends FrameLayout {
    private final NativeViewOnceLayout layout;
    private final WebView player;
    private View fullscreenView;
    private WebChromeClient.CustomViewCallback fullscreenCallback;
    private AudioManager audio;
    private int capturePolicy;
    private boolean closed;
    private Runnable firstFrame = () -> {};
    void onFirstFrame(Runnable callback) { firstFrame = callback; }

    NativeViewOnceWebVideo(NativeViewOnceLayout layout) {
        super(layout.getContext());
        this.layout = layout;
        setBackgroundColor(Color.BLACK);
        player = new WebView(getContext());
        player.setBackgroundColor(Color.BLACK);
        WebSettings settings = player.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setBlockNetworkLoads(true);
        settings.setDomStorageEnabled(false);
        settings.setDatabaseEnabled(false);
        settings.setCacheMode(WebSettings.LOAD_NO_CACHE);
        settings.setSupportZoom(false);
        settings.setMediaPlaybackRequiresUserGesture(false);
        player.setOnLongClickListener(view -> true);
        player.setLongClickable(false);
        player.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return !request.getUrl().toString().equals("about:blank");
            }
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                String scheme = request.getUrl().getScheme();
                if ("data".equals(scheme) || "blob".equals(scheme)) return null;
                return new WebResourceResponse("text/plain", "UTF-8", new ByteArrayInputStream(new byte[0]));
            }
        });
        player.setWebChromeClient(new WebChromeClient() {
            @Override public void onShowCustomView(View view, CustomViewCallback callback) {
                if (closed || fullscreenView != null) { callback.onCustomViewHidden(); return; }
                fullscreenView = view;
                fullscreenCallback = callback;
                player.setVisibility(INVISIBLE);
                layout.showVideoFullscreen(view, NativeViewOnceWebVideo.this::exitFullscreen);
            }
            @Override public void onHideCustomView() { exitFullscreen(); }
        });
        WebViewCompat.addWebMessageListener(player, "ZeroXVideoMetadata",
            Collections.singleton("https://view-once.invalid"), (view, message, origin, mainFrame, reply) -> {
                if (closed || !mainFrame || !origin.toString().equals("https://view-once.invalid")) return;
                try {
                    String value = message.getType() == WebMessageCompat.TYPE_STRING ? message.getData() : null;
                    if (value == null || value.length() > 128) throw NativePolicy.failure();
                    JSONObject metadata = new JSONObject(value);
                    if (metadata.length() == 1 && metadata.optBoolean("frame")) {
                        firstFrame.run();
                        return;
                    }
                    int width = metadata.getInt("width"), height = metadata.getInt("height");
                    if (metadata.length() != 2 || width <= 0 || height <= 0 ||
                        (long) width * height > 8_400_000) throw NativePolicy.failure();
                    layout.setMediaSize(width, height);
                } catch (Exception invalid) { fail(); }
            });
        addView(player, new FrameLayout.LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT));
    }

    void load(byte[] bytes, String mime) {
        try {
            if (closed || bytes.length == 0 || bytes.length > 10_000_000 ||
                !(mime.equals("video/mp4") || mime.equals("video/quicktime"))) throw NativePolicy.failure();
            if (Build.VERSION.SDK_INT >= 29) {
                audio = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
                capturePolicy = audio.getAllowedCapturePolicy();
                audio.setAllowedCapturePolicy(AudioAttributes.ALLOW_CAPTURE_BY_NONE);
            }
            byte[] random = new byte[18];
            new SecureRandom().nextBytes(random);
            String nonce = Base64.encodeToString(random, Base64.NO_WRAP);
            String html = DOCUMENT.replace("__NONCE__", nonce).replace("__MIME__", mime)
                .replace("__DIAGNOSTIC__", Boolean.toString(app.zeroxdmme.development.BuildConfig.DEBUG && app.zeroxdmme.development.BuildConfig.MOBILE_DIAGNOSTICS))
                .replace("__DATA__", Base64.encodeToString(bytes, Base64.NO_WRAP));
            player.loadDataWithBaseURL("https://view-once.invalid/", html, "text/html", "UTF-8", null);
        } catch (Exception unavailable) { fail(); }
        finally { Arrays.fill(bytes, (byte) 0); }
    }

    private void exitFullscreen() {
        View view = fullscreenView;
        WebChromeClient.CustomViewCallback callback = fullscreenCallback;
        fullscreenView = null;
        fullscreenCallback = null;
        if (view != null) layout.hideVideoFullscreen(view);
        if (!closed) player.setVisibility(VISIBLE);
        if (callback != null) callback.onCustomViewHidden();
    }

    private void fail() { close(); layout.show(null, "Could not play this video."); }

    void close() {
        firstFrame = () -> {};
        if (closed) return;
        closed = true;
        exitFullscreen();
        player.stopLoading();
        player.loadUrl("about:blank");
        player.onPause();
        removeAllViews();
        player.destroy();
        if (Build.VERSION.SDK_INT >= 29 && audio != null) audio.setAllowedCapturePolicy(capturePolicy);
        audio = null;
    }

    private static final String DOCUMENT = """
        <!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; media-src data: blob:; style-src 'nonce-__NONCE__'; script-src 'nonce-__NONCE__'; connect-src 'none'; base-uri 'none'; form-action 'none'">
        <style nonce="__NONCE__">
        html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#000;color:#fff;color-scheme:dark}
        video{display:block;width:100%;height:100%;object-fit:contain;background:#000}
        button{position:absolute;top:10px;right:10px;display:grid;place-items:center;width:36px;height:36px;padding:0;border:0;border-radius:999px;background:#0009;color:#fff}
        svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
        </style></head><body>
        <video controls playsinline preload="auto" controlslist="nodownload noremoteplayback" disablepictureinpicture src="data:__MIME__;base64,__DATA__"></video>
        <button type="button" aria-label="Full screen"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/></svg></button>
        <script nonce="__NONCE__">
        const video=document.querySelector('video');
        if (__DIAGNOSTIC__ && typeof video.requestVideoFrameCallback === 'function')
          video.requestVideoFrameCallback(()=>ZeroXVideoMetadata.postMessage('{"frame":true}'));
        video.addEventListener('loadedmetadata',()=>{
          ZeroXVideoMetadata.postMessage(JSON.stringify({width:video.videoWidth,height:video.videoHeight}));
          video.play().catch(()=>{});
        });
        video.addEventListener('error',()=>ZeroXVideoMetadata.postMessage('{}'));
        document.addEventListener('contextmenu',event=>event.preventDefault());
        document.querySelector('button').addEventListener('click',()=>{
          if(document.fullscreenElement)document.exitFullscreen();
          else video.requestFullscreen().catch(()=>{});
        });
        </script></body></html>
        """;
}
