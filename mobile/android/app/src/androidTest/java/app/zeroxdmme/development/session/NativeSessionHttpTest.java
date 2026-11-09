package app.zeroxdmme.development.session;

import static org.junit.Assert.*;
import android.content.Context;
import android.util.Base64;
import androidx.test.platform.app.InstrumentationRegistry;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.json.JSONObject;
import org.junit.Test;

/** Real native HTTPS against the explicit private service, with no session
 * credential and an intentionally unauthenticated synthetic request. */
public class NativeSessionHttpTest {
    @Test public void sendsBoundedJsonAndPreservesTheRealUnauthorizedHttpResponse() throws Exception {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        assertTrue("An explicit private fixture is required before any HTTP request",
            Arrays.asList(context.getAssets().list("")).contains("native-synthetic-test.json"));
        // The debug factory validates the loopback URL and independent test CA;
        // absence is rejected above, so this test cannot reach a real service.
        NativeSession session = NativeConnectionFactory.create(context);
        try {
            long deadline = android.os.SystemClock.elapsedRealtime() + 15_000;
            while (!session.ready()) {
                assertTrue("Native cookie custody did not initialize", android.os.SystemClock.elapsedRealtime() < deadline);
                android.os.SystemClock.sleep(50);
            }
            String id = UUID.randomUUID().toString();
            char[] padding = new char[64 * 1024];
            Arrays.fill(padding, 'a');
            String body = new JSONObject().put("synthetic", new String(padding)).toString();
            JSONObject request = new JSONObject().put("id", id)
                .put("path", "/api/account/messages/matrix-upload")
                .put("method", "POST").put("credentials", "omit")
                .put("headers", new JSONObject().put("content-type", "application/json"))
                .put("bodyBase64", Base64.encodeToString(body.getBytes(StandardCharsets.UTF_8), Base64.NO_WRAP));
            Result head = new Result();
            session.open(request, head);
            assertEquals(401, head.value().getInt("status"));
            boolean done = false;
            for (int read = 0; read < 32 && !done; read++) {
                Result part = new Result();
                session.read(new JSONObject().put("id", id).put("bytes", 4096), part);
                done = part.value().getBoolean("done");
            }
            assertTrue("The rejected response did not reach a genuine EOF", done);
        } finally {
            session.close();
        }
    }

    private static final class Result implements NativeSession.Reply {
        private final CountDownLatch completed = new CountDownLatch(1);
        private final AtomicReference<Object> response = new AtomicReference<>();
        @Override public void value(Object value) { response.set(value); completed.countDown(); }
        @Override public void failure() { completed.countDown(); }
        JSONObject value() throws Exception {
            assertTrue("The native HTTP operation exceeded its deadline", completed.await(20, TimeUnit.SECONDS));
            assertTrue("The native HTTP operation failed before its response", response.get() instanceof JSONObject);
            return (JSONObject) response.get();
        }
    }
}
