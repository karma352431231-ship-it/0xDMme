package app.zeroxdmme.development.session;

import android.content.Context;
import android.os.SystemClock;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.ScheduledThreadPoolExecutor;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import okhttp3.Authenticator;
import okhttp3.ConnectionPool;
import okhttp3.CookieJar;
import okhttp3.HttpUrl;
import okhttp3.OkHttpClient;
import org.json.JSONObject;

/** Owns admission, deadlines, private-cookie commits and native HTTP disposal.
 * The channel authorizes documents; exchanges own sockets and streaming bodies.
 */
final class NativeSession {
    interface Reply {
        void value(Object value);
        void failure();
    }

    private static final class Once implements Reply {
        private final Reply reply;
        private final AtomicBoolean sent = new AtomicBoolean();
        Once(Reply reply) { this.reply = reply; }
        @Override public void value(Object value) { if (sent.compareAndSet(false, true)) reply.value(value); }
        @Override public void failure() { if (sent.compareAndSet(false, true)) reply.failure(); }
    }

    private static final class Entry {
        final String id;
        final int bodyBytes;
        final NativeExchange exchange;
        final NativeCookies.Ticket ticket;
        final boolean credentials;
        final Once head;
        final AtomicBoolean cancelling = new AtomicBoolean();
        Once reader;
        boolean headers;
        long deadline;
        ScheduledFuture<?> timer;
        Entry(NativePolicy.Request request, NativeExchange exchange, NativeCookies.Ticket ticket, Once head) {
            id = request.id;
            bodyBytes = request.body == null ? 0 : request.body.length;
            credentials = request.credentials;
            this.exchange = exchange;
            this.ticket = ticket;
            this.head = head;
        }
    }

    private final Object admission = new Object();
    private final Map<String, Entry> entries = new LinkedHashMap<>();
    private final Map<String, Long> cancelled = new LinkedHashMap<>();
    private final Map<String, Long> completed = new LinkedHashMap<>();
    private final AtomicBoolean closed = new AtomicBoolean();
    private final ThreadPoolExecutor io = pool(8, 8, "0xdmme-http");
    private final ThreadPoolExecutor cleanup = pool(2, 32, "0xdmme-http-cleanup");
    private final ScheduledThreadPoolExecutor clock = new ScheduledThreadPoolExecutor(1, work -> {
        Thread thread = new Thread(work, "0xdmme-http-deadlines");
        thread.setDaemon(true);
        return thread;
    });
    private final OkHttpClient client;
    private final HttpUrl destination;
    private final java.util.function.BiConsumer<String, Exception> failureReport;
    private volatile NativeCookies cookies;
    private volatile boolean initializationFailed;
    private int bodyBytes;

    NativeSession(Context context) {
        this(context, client(), HttpUrl.get(NativePolicy.SERVICE + "/"));
    }

    /** A native-only test factory may supply its independently trusted TLS peer.
     * No JavaScript, intent, deep-link or production preference reaches this API.
     */
    NativeSession(Context context, OkHttpClient client, HttpUrl destination) {
        this(context, client, destination, (phase, failure) -> {});
    }

    /** Only the explicit synthetic composition supplies a bounded observer.
     * Release composition never logs native exceptions or private request data. */
    NativeSession(Context context, OkHttpClient client, HttpUrl destination,
                  java.util.function.BiConsumer<String, Exception> failureReport) {
        if (!destination.isHttps() || !destination.encodedPath().equals("/") || destination.query() != null || !destination.username().isEmpty() || !destination.password().isEmpty()) throw new IllegalArgumentException("Invalid native destination.");
        this.client = client;
        this.destination = destination;
        this.failureReport = failureReport;
        clock.setRemoveOnCancelPolicy(true);
        Context application = context.getApplicationContext();
        io.execute(() -> {
            try {
                NativeCookies opened = NativeCookieRegistry.open(application);
                if (!closed.get()) cookies = opened;
            } catch (Exception failure) {
                failureReport.accept("cookie-initialization", failure);
                initializationFailed = true;
            }
        });
    }

    static OkHttpClient client() {
        return new OkHttpClient.Builder()
            .cookieJar(CookieJar.NO_COOKIES).cache(null)
            .authenticator(Authenticator.NONE).proxyAuthenticator(Authenticator.NONE)
            .followRedirects(false).followSslRedirects(false).retryOnConnectionFailure(false)
            .connectTimeout(15, TimeUnit.SECONDS).readTimeout(15, TimeUnit.SECONDS)
            .writeTimeout(15, TimeUnit.SECONDS).callTimeout(0, TimeUnit.MILLISECONDS)
            .connectionPool(new ConnectionPool(2, 30, TimeUnit.SECONDS)).build();
    }

    boolean ready() throws Exception {
        if (closed.get() || initializationFailed) throw NativePolicy.failure();
        return cookies != null;
    }

    void open(JSONObject input, Reply reply) {
        Once answer = new Once(reply);
        Entry entry;
        String phase = "request-policy";
        try {
            if (!ready()) throw NativePolicy.failure();
            NativePolicy.Request request = new NativePolicy.Request(input);
            NativeCookies jar = cookies;
            if (jar == null) throw NativePolicy.failure();
            phase = "request-admission";
            synchronized (admission) {
                pruneIds();
                int bytes = request.body == null ? 0 : request.body.length;
                if (closed.get() || entries.size() >= 8 || entries.containsKey(request.id) || cancelled.containsKey(request.id) || bodyBytes + bytes > 16_800_000) throw NativePolicy.failure();
                NativeCookies.Ticket ticket = jar.reserve(request.credentials ? request.path : "");
                phase = "request-construction";
                NativeExchange exchange = new NativeExchange(request, client, destination, request.credentials ? jar.header() : "");
                entry = new Entry(request, exchange, ticket, answer);
                entries.put(request.id, entry);
                bodyBytes += bytes;
            }
            synchronized (entry) { deadline(entry, 15_000); }
            phase = "request-execution";
            io.execute(() -> headers(entry));
        } catch (Exception failure) {
            failureReport.accept(phase, failure);
            answer.failure();
            // A rejected executor is terminal; retained native work cannot grow.
            if (failure instanceof RejectedExecutionException) close();
        }
    }

    private void headers(Entry entry) {
        try {
            NativeExchange.Head head = entry.exchange.open();
            synchronized (entry) {
                current(entry);
                if (entry.credentials) {
                    NativeCookies jar = cookies;
                    if (jar == null) throw NativePolicy.failure();
                    // Header installation and cancellation have one native order.
                    // Cancellation acknowledges only after this critical section.
                    jar.apply(entry.ticket, head.cookies);
                }
                current(entry);
                entry.headers = true;
                deadline(entry, 30_000);
                entry.head.value(head.visible);
            }
        } catch (Exception failure) {
            if (!entry.cancelling.get() && !closed.get()) failureReport.accept("response-headers", failure);
            abandon(entry);
        }
    }

    void read(JSONObject input, Reply reply) {
        Once answer = new Once(reply);
        try {
            int bytes = NativePolicy.readBytes(input);
            Entry entry = entry(NativePolicy.identifier(input, "id"));
            synchronized (entry) {
                current(entry);
                if (!entry.headers || entry.reader != null) throw NativePolicy.failure();
                entry.reader = answer;
                deadline(entry, 15_000);
            }
            io.execute(() -> chunk(entry, bytes, answer));
        } catch (Exception failure) {
            answer.failure();
            if (failure instanceof RejectedExecutionException) close();
        }
    }

    private void chunk(Entry entry, int bytes, Once answer) {
        try {
            JSONObject value = entry.exchange.read(bytes);
            boolean done = value.getBoolean("done");
            synchronized (entry) {
                current(entry);
                entry.reader = null;
                if (!done) deadline(entry, 30_000);
            }
            if (done) finish(entry);
            answer.value(value);
        } catch (Exception failure) {
            if (!entry.cancelling.get() && !closed.get()) failureReport.accept("response-body", failure);
            answer.failure();
            abandon(entry);
        }
    }

    void cancel(JSONObject input, Reply reply) {
        Once answer = new Once(reply);
        try {
            NativePolicy.exact(input, "id");
            if (input.length() != 1) throw NativePolicy.failure();
            String id = NativePolicy.identifier(input, "id");
            Entry entry;
            synchronized (admission) {
                pruneIds();
                entry = entries.get(id);
                if (entry == null && !completed.containsKey(id)) {
                    if (cancelled.size() >= 32) throw NativePolicy.failure();
                    cancelled.put(id, SystemClock.elapsedRealtime() + 30_000);
                }
            }
            if (entry == null) { answer.value(JSONObject.NULL); return; }
            entry.cancelling.set(true);
            entry.exchange.abort();
            cleanup.execute(() -> {
                abandon(entry);
                answer.value(JSONObject.NULL);
            });
        } catch (Exception failure) {
            answer.failure();
            if (failure instanceof RejectedExecutionException) close();
        }
    }

    private Entry entry(String id) throws Exception {
        synchronized (admission) {
            Entry entry = entries.get(id);
            if (entry == null) throw NativePolicy.failure();
            return entry;
        }
    }

    private void current(Entry entry) throws Exception {
        if (closed.get() || entry.cancelling.get() || SystemClock.elapsedRealtime() > entry.deadline) throw NativePolicy.failure();
        synchronized (admission) { if (entries.get(entry.id) != entry) throw NativePolicy.failure(); }
    }

    private void deadline(Entry entry, long milliseconds) {
        if (entry.timer != null) entry.timer.cancel(false);
        entry.deadline = SystemClock.elapsedRealtime() + milliseconds;
        final long expected = entry.deadline;
        entry.timer = clock.schedule(() -> {
            synchronized (entry) {
                if (entry.deadline != expected || entry.cancelling.get()) return;
                entry.cancelling.set(true);
                entry.exchange.abort();
            }
            try { cleanup.execute(() -> abandon(entry)); }
            catch (RejectedExecutionException failure) { close(); }
        }, milliseconds, TimeUnit.MILLISECONDS);
    }

    private void abandon(Entry entry) {
        synchronized (entry) {
            entry.cancelling.set(true);
            entry.head.failure();
            if (entry.reader != null) entry.reader.failure();
            entry.reader = null;
            finish(entry);
        }
    }

    private void finish(Entry entry) {
        synchronized (entry) {
            if (entry.timer != null) entry.timer.cancel(false);
            entry.exchange.close();
            synchronized (admission) {
                if (entries.get(entry.id) != entry) return;
                entries.remove(entry.id);
                bodyBytes -= entry.bodyBytes;
                completed.put(entry.id, SystemClock.elapsedRealtime() + 30_000);
                while (completed.size() > 256) completed.remove(completed.keySet().iterator().next());
            }
        }
    }

    void cancelDocument() {
        List<Entry> current;
        synchronized (admission) { current = new ArrayList<>(entries.values()); }
        for (Entry entry : current) {
            entry.cancelling.set(true);
            entry.exchange.abort();
            try { cleanup.execute(() -> abandon(entry)); }
            catch (RejectedExecutionException failure) { close(); return; }
        }
    }

    void close() {
        if (!closed.compareAndSet(false, true)) return;
        List<Entry> current;
        synchronized (admission) { current = new ArrayList<>(entries.values()); }
        for (Entry entry : current) {
            entry.cancelling.set(true);
            entry.exchange.abort();
        }
        // At most one final cleanup task exists, including executor rejection.
        Thread finalizer = new Thread(() -> {
            for (Entry entry : current) abandon(entry);
            cookies = null;
            client.connectionPool().evictAll();
        }, "0xdmme-http-finalize");
        finalizer.setDaemon(true);
        finalizer.start();
        io.shutdownNow();
        cleanup.shutdown();
        clock.shutdownNow();
        client.dispatcher().executorService().shutdown();
    }

    private void pruneIds() {
        long now = SystemClock.elapsedRealtime();
        for (Map<String, Long> records : java.util.Arrays.asList(cancelled, completed)) {
            Iterator<Map.Entry<String, Long>> values = records.entrySet().iterator();
            while (values.hasNext()) if (values.next().getValue() <= now) values.remove();
        }
    }

    private static ThreadPoolExecutor pool(int threads, int queued, String name) {
        return new ThreadPoolExecutor(threads, threads, 0, TimeUnit.MILLISECONDS, new ArrayBlockingQueue<>(queued), work -> {
            Thread thread = new Thread(work, name);
            thread.setDaemon(true);
            return thread;
        }, new ThreadPoolExecutor.AbortPolicy());
    }
}
