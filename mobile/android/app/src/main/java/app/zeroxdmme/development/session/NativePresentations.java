package app.zeroxdmme.development.session;

import android.webkit.WebView;
import java.util.function.Consumer;
import org.json.JSONObject;

/** Owns admission between native presentations; only view-once changes the
 * protected network capability. Replayable videos cannot grant that capability. */
final class NativePresentations {
    private final NativeViewOnce viewOnce;
    private final NativeChatVideo video;
    NativePresentations(WebView source, Consumer<Boolean> protectedState) {
        viewOnce = new NativeViewOnce(source, protectedState);
        video = new NativeChatVideo(source);
    }
    Object dispatch(String operation, JSONObject input) throws Exception {
        if ((operation.equals("view-begin") || operation.equals("video-begin")) && (viewOnce.active() || video.active()))
            throw NativePolicy.failure();
        return operation.startsWith("view-") ? viewOnce.dispatch(operation, input) : video.dispatch(operation, input);
    }
    void awaitFrame(String operation, JSONObject input, NativeSession.Reply reply) throws Exception {
        if (operation.equals("view-frame")) viewOnce.awaitFrame(input, reply);
        else video.awaitFrame(input, reply);
    }
    void close() { video.close(); viewOnce.close(); }
}
