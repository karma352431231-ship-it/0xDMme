package app.zeroxdmme.development.session;

import android.util.Base64;
import java.io.InputStream;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicBoolean;
import okhttp3.Call;
import okhttp3.HttpUrl;
import okhttp3.MediaType;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;
import okhttp3.ResponseBody;
import org.json.JSONObject;

/** One bounded streaming HTTP operation. It never reads or persists cookies. */
final class NativeExchange {
    static final class Head {
        final JSONObject visible;
        final List<String> cookies;
        Head(JSONObject visible, List<String> cookies) {
            this.visible = visible;
            this.cookies = cookies;
        }
    }

    private final NativePolicy.Request policy;
    private final Call call;
    private final AtomicBoolean closed = new AtomicBoolean();
    private final AtomicBoolean reading = new AtomicBoolean();
    private volatile Response response;
    private volatile InputStream stream;
    private long total;
    private long expected = -1;
    private boolean live;

    NativeExchange(NativePolicy.Request policy, OkHttpClient client, HttpUrl destination, String cookies) throws Exception {
        this(policy, client, destination, cookies, false);
    }
    NativeExchange(NativePolicy.Request policy, OkHttpClient client, HttpUrl destination, String cookies, boolean protectedView) throws Exception {
        this.policy = policy;
        HttpUrl url = destination.resolve(policy.path);
        if (url == null || !url.isHttps() || !url.host().equals(destination.host()) || url.port() != destination.port()) throw NativePolicy.failure();
        Request.Builder request = new Request.Builder().url(url)
            .header("Origin", NativePolicy.SERVICE)
            .header("Accept-Encoding", "identity");
        for (Map.Entry<String, String> header : policy.headers.entrySet()) request.header(header.getKey(), header.getValue());
        if (protectedView && policy.path.equals("/api/account/messages/view-once-open"))
            request.header("Sec-0xdmme-Installed-View", "1");
        if (!cookies.isEmpty()) request.header("Cookie", cookies);
        RequestBody body = policy.method.equals("POST")
            ? RequestBody.create(policy.body == null ? new byte[0] : policy.body,
                policy.headers.containsKey("content-type") ? MediaType.parse(policy.headers.get("content-type")) : null)
            : null;
        call = client.newCall(request.method(policy.method, body).build());
    }

    Head open() throws Exception {
        long started = NativeExchangeTiming.start();
        Response received = call.execute();
        long receiveUs = NativeExchangeTiming.elapsed(started);
        synchronized (this) {
            if (closed.get()) {
                received.close();
                throw NativePolicy.failure();
            }
            response = received;
            int status = received.code();
            if (status < 200 || status > 599 || (status >= 300 && status < 400)) throw NativePolicy.failure();
            String encoding = received.header("Content-Encoding");
            if (encoding != null && !encoding.equalsIgnoreCase("identity")) throw NativePolicy.failure();
            JSONObject headers = safeHeaders(received);
            String length = received.header("Content-Length");
            if (length != null) expected = length(length);
            String type = received.header("Content-Type", "").split(";", 2)[0].trim();
            live = policy.live() && type.equalsIgnoreCase("text/event-stream");
            ResponseBody body = received.body();
            if (body == null) throw NativePolicy.failure();
            stream = body.byteStream();
            return new Head(NativeExchangeTiming.attach(new JSONObject().put("status", status).put("headers", headers), receiveUs, 0), received.headers("Set-Cookie"));
        }
    }

    JSONObject read(int maximum) throws Exception {
        if (maximum < 1 || maximum > (live ? 4096 : NativePolicy.CHUNK_BYTES) || !reading.compareAndSet(false, true)) throw NativePolicy.failure();
        try {
          synchronized (this) {
            InputStream source = stream;
            if (closed.get() || source == null) throw NativePolicy.failure();
            byte[] bytes = new byte[maximum];
            int count = 0;
            boolean done = expected >= 0 && total == expected;
            // A socket read often returns only 4 KiB. Fill the bounded bridge
            // chunk for finite bodies instead of crossing the WebView for every
            // network fragment. Live events must still be delivered immediately.
            long readingAt = NativeExchangeTiming.start();
            while (!done && count < maximum) {
                int received = source.read(bytes, count, maximum - count);
                if (closed.get() || received == 0) throw NativePolicy.failure();
                if (received == -1) { done = true; break; }
                count += received;
                if (expected >= 0 && total + count == expected) done = true;
                if (live) break;
            }
            long receiveUs = NativeExchangeTiming.elapsed(readingAt);
            total = Math.addExact(total, count);
            if ((!live && total > NativePolicy.RESPONSE_BYTES) ||
                (expected >= 0 && (total > expected || (done && total != expected)))) throw NativePolicy.failure();
            long encodingAt = NativeExchangeTiming.start();
            String data = Base64.encodeToString(Arrays.copyOf(bytes, count), Base64.NO_WRAP);
            return NativeExchangeTiming.attach(new JSONObject().put("done", done).put("data", data),
                receiveUs, NativeExchangeTiming.elapsed(encodingAt));
          }
        } finally {
            reading.set(false);
        }
    }

    /** Thread-safe cancellation interrupts blocked socket operations first. */
    void abort() {
        closed.set(true);
        call.cancel();
    }

    void close() {
        abort();
        Response current;
        synchronized (this) {
            current = response;
            response = null;
            stream = null;
        }
        if (current != null) current.close();
    }

    private static long length(String value) throws Exception {
        if (!value.matches("0|[1-9][0-9]{0,9}")) throw NativePolicy.failure();
        long length = Long.parseLong(value);
        if (length > NativePolicy.RESPONSE_BYTES) throw NativePolicy.failure();
        return length;
    }

    private static JSONObject safeHeaders(Response response) throws Exception {
        JSONObject result = new JSONObject();
        for (String name : Arrays.asList("content-type", "content-length", "cache-control", "retry-after", "x-0xdmme-server-time")) {
            List<String> values = response.headers(name);
            if (values.isEmpty()) continue;
            if (values.size() != 1) throw NativePolicy.failure();
            String value = values.get(0);
            if (value.length() > 256) throw NativePolicy.failure();
            for (int i = 0; i < value.length(); i++)
                if (Character.isISOControl(value.charAt(i))) throw NativePolicy.failure();
            result.put(name, value);
        }
        return result;
    }
}
