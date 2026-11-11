package app.zeroxdmme.development;

import com.getcapacitor.BridgeActivity;
import android.webkit.WebView;
import app.zeroxdmme.development.session.NativeSessionChannel;
import app.zeroxdmme.development.media.NativeMediaPermissions;
import android.webkit.PermissionRequest;
import com.getcapacitor.BridgeWebChromeClient;

public class MainActivity extends BridgeActivity {
    private NativeSessionChannel session;
    private NativeMediaPermissions media;

    @Override protected void load() {
        WebView view = findViewById(com.getcapacitor.android.R.id.webview);
        session = new NativeSessionChannel(view);
        bridgeBuilder.addWebViewListener(session);
        super.load();
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG && BuildConfig.MOBILE_DIAGNOSTICS);
        media = new NativeMediaPermissions(bridge, view);
        bridge.addWebViewListener(media);
        view.setWebChromeClient(new BridgeWebChromeClient(bridge) {
            @Override public void onPermissionRequest(PermissionRequest request) { media.request(request); }
            @Override public void onPermissionRequestCanceled(PermissionRequest request) { media.cancel(request); }
        });
    }

    @Override protected void onActivityResult(int request, int result, android.content.Intent data) {
        if (session != null && session.fileResult(request, result, data)) return;
        super.onActivityResult(request, result, data);
    }

    @Override public void onStop() {
        if (session != null) session.suspend();
        if (media != null) media.suspend();
        super.onStop();
    }

    @Override public void onDestroy() {
        if (session != null) session.close();
        if (media != null) media.close();
        super.onDestroy();
    }
}
