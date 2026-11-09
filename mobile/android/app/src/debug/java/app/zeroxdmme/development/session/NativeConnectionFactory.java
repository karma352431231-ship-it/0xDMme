package app.zeroxdmme.development.session;

import android.content.Context;
import java.io.InputStream;
import java.security.KeyStore;
import java.security.cert.Certificate;
import java.security.cert.CertificateFactory;
import javax.net.ssl.SSLContext;
import javax.net.ssl.TrustManager;
import javax.net.ssl.TrustManagerFactory;
import javax.net.ssl.X509TrustManager;
import okhttp3.HttpUrl;
import okhttp3.OkHttpClient;
import org.json.JSONObject;

/** Private test composition, absent from release. A prepared debug asset may
 * select a loopback TLS peer with an independent CA; hostname checks stay on.
 * Missing configuration uses the unchanged production composition.
 */
final class NativeConnectionFactory {
    private static final java.util.concurrent.atomic.AtomicInteger reports = new java.util.concurrent.atomic.AtomicInteger();
    private NativeConnectionFactory() {}

    static NativeSession create(Context context) {
        try {
            boolean configured = java.util.Arrays.asList(context.getAssets().list("")).contains("native-synthetic-test.json");
            if (!configured) return new NativeSession(context);
            JSONObject config;
            try (InputStream file = context.getAssets().open("native-synthetic-test.json")) {
                byte[] bytes = bounded(file, 1024);
                config = NativePolicy.parse(new String(bytes, java.nio.charset.StandardCharsets.UTF_8));
            }
            NativePolicy.exact(config, "kind", "url");
            if (config.length() != 2 || !"synthetic-native-v1".equals(config.opt("kind"))) throw NativePolicy.failure();
            HttpUrl url = HttpUrl.get(NativePolicy.text(config, "url", 128));
            if (!url.host().equals("127.0.0.1") || url.port() < 45111 || url.port() > 45119) throw NativePolicy.failure();
            OkHttpClient client = NativeSession.client().newBuilder()
                .sslSocketFactory(ssl(context).getSocketFactory(), trust(context)).build();
            return new NativeSession(context, client, url, NativeConnectionFactory::report);
        } catch (Exception invalid) {
            // A corrupt explicit fixture must not silently reach a real service.
            throw new IllegalStateException("Invalid private synthetic test configuration.");
        }
    }

    private static void report(String phase, Exception failure) {
        if (reports.getAndUpdate(count -> Math.min(32, count + 1)) >= 32) return;
        // Only fixed phases, exception classes and source locations. Never
        // exception messages, request data, URLs, cookies, keys or identifiers.
        StringBuilder location = new StringBuilder(phase).append(':')
            .append(failure.getClass().getSimpleName());
        StackTraceElement[] stack = failure.getStackTrace();
        for (int index = 0; index < Math.min(6, stack.length); index++) {
            StackTraceElement frame = stack[index];
            location.append('|').append(frame.getClassName()).append('.')
                .append(frame.getMethodName()).append(':').append(frame.getLineNumber());
        }
        Throwable cause = failure.getCause();
        if (cause != null) location.append("|cause:").append(cause.getClass().getSimpleName());
        android.util.Log.i("0xDMmeSynthetic", location.toString());
    }

    private static SSLContext ssl(Context context) throws Exception {
        SSLContext ssl = SSLContext.getInstance("TLS");
        ssl.init(null, new TrustManager[] { trust(context) }, null);
        return ssl;
    }

    private static X509TrustManager trust(Context context) throws Exception {
        Certificate ca;
        try (InputStream input = context.getAssets().open("native-synthetic-ca.pem")) {
            ca = CertificateFactory.getInstance("X.509").generateCertificate(input);
        }
        KeyStore trusted = KeyStore.getInstance(KeyStore.getDefaultType());
        trusted.load(null);
        trusted.setCertificateEntry("synthetic-test-ca", ca);
        TrustManagerFactory factory = TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm());
        factory.init(trusted);
        TrustManager[] managers = factory.getTrustManagers();
        if (managers.length != 1 || !(managers[0] instanceof X509TrustManager)) throw NativePolicy.failure();
        return (X509TrustManager) managers[0];
    }

    private static byte[] bounded(InputStream input, int maximum) throws Exception {
        java.io.ByteArrayOutputStream bytes = new java.io.ByteArrayOutputStream();
        byte[] part = new byte[maximum];
        for (;;) {
            int count = input.read(part);
            if (count == -1) return bytes.toByteArray();
            if (count == 0 || bytes.size() + count > maximum) throw NativePolicy.failure();
            bytes.write(part, 0, count);
        }
    }
}
