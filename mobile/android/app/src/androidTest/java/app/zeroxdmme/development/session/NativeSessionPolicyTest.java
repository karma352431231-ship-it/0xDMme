package app.zeroxdmme.development.session;

import static org.junit.Assert.*;
import android.content.Context;
import android.content.pm.ApplicationInfo;
import android.util.Base64;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.File;
import java.io.RandomAccessFile;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.UUID;
import javax.crypto.SecretKey;
import org.json.JSONObject;
import org.junit.After;
import org.junit.Test;

/** Exercises native policy and OS custody only with isolated synthetic tokens. */
public class NativeSessionPolicyTest {
    @Test public void initialRouteFragmentDoesNotReplaceTheCommittedDocument() {
        assertTrue(NativeSessionChannel.sameDocument("https://localhost/", "https://localhost/#perfil"));
        assertTrue(NativeSessionChannel.sameDocument("https://localhost/wallet.html?view=entry#one", "https://localhost/wallet.html?view=entry#two"));
        for (String changed : new String[] {"https://untrusted.invalid/#perfil", "http://localhost/#perfil", "https://localhost/wallet.html#perfil", "https://localhost/?view=other#perfil"}) {
            assertFalse(NativeSessionChannel.sameDocument("https://localhost/", changed));
        }
        assertFalse(NativeSessionChannel.sameDocument("https://localhost/", null));
    }
    private final Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
    private final List<EncryptedCookieStore> stores = new ArrayList<>();

    @After public void cleanup() throws Exception {
        for (EncryptedCookieStore store : stores) store.eraseSynthetic();
    }

    private EncryptedCookieStore store(String namespace) throws Exception {
        EncryptedCookieStore store = new EncryptedCookieStore(context, namespace);
        stores.add(store);
        return store;
    }

    private JSONObject request(String body) throws Exception {
        return new JSONObject().put("id", UUID.randomUUID().toString())
            .put("path", "/api/account/messages/page?after=%2B")
            .put("method", "POST").put("credentials", "same-origin")
            .put("headers", new JSONObject().put("content-type", "application/json")
                .put("x-hash-talk-csrf", repeat('a')))
            .put("bodyBase64", Base64.encodeToString(body.getBytes(StandardCharsets.UTF_8), Base64.NO_WRAP));
    }

    private static String repeat(char value) {
        char[] text = new char[64];
        Arrays.fill(text, value);
        return new String(text);
    }

    private static String cookie(String name, String value, long seconds) {
        return "__Host-hash-talk-" + name + "=" + value + "; Path=/; HttpOnly; SameSite=Strict; Max-Age=" + seconds + "; Secure";
    }

    @Test public void preservesSignedUtf8AndRejectsUntrustedRequestFields() throws Exception {
        String signed = "{\"message\":\"Synthetic Unicode — 测试\",\"signature\":\"unchanged\"}";
        NativePolicy.Request valid = new NativePolicy.Request(request(signed));
        assertEquals(signed, new String(valid.body, StandardCharsets.UTF_8));
        assertTrue(valid.credentials);
        for (String path : Arrays.asList("https://other.example/api/account/session", "//other.example/api/account", "/api/account/../session", "/api/account/%2fsecret", "/api/account/session#fragment", "/api/account/session?")) {
            JSONObject bad = request(signed).put("path", path);
            assertThrows(Exception.class, () -> new NativePolicy.Request(bad));
        }
        JSONObject cookie = request(signed).put("headers", new JSONObject().put("cookie", "synthetic"));
        assertThrows(Exception.class, () -> new NativePolicy.Request(cookie));
        JSONObject destination = request(signed).put("origin", "https://other.example");
        assertThrows(Exception.class, () -> new NativePolicy.Request(destination));
        JSONObject credentials = request(signed).put("credentials", true);
        assertThrows(Exception.class, () -> new NativePolicy.Request(credentials));
        JSONObject invalidBase64 = request(signed).put("bodyBase64", "YQ==\n");
        assertThrows(Exception.class, () -> new NativePolicy.Request(invalidBase64));
        assertThrows(Exception.class, () -> NativePolicy.parse("{} unexpected"));
    }

    @Test public void persistsOnlyPrivateCookiesAndPreventsOlderResponseResurrection() throws Exception {
        String namespace = "synthetic-" + UUID.randomUUID();
        NativeCookies jar = new NativeCookies(store(namespace));
        NativeCookies.Ticket first = jar.reserve("/api/account/challenge");
        NativeCookies.Ticket second = jar.reserve("/api/account/challenge");
        assertThrows(Exception.class, () -> jar.apply(first, Collections.singletonList(cookie("challenge", repeat('a'), 300))));
        jar.apply(second, Collections.singletonList(cookie("challenge", repeat('b'), 300)));
        assertEquals("__Host-hash-talk-challenge=" + repeat('b'), new NativeCookies(new EncryptedCookieStore(context, namespace)).header());
        NativeCookies.Ticket login = jar.reserve("/api/account/login");
        NativeCookies.Ticket logout = jar.reserve("/api/account/logout");
        assertThrows(Exception.class, () -> jar.apply(login, Arrays.asList(cookie("session", repeat('c'), 160L * 24 * 60 * 60), cookie("challenge", "", 0))));
        jar.apply(logout, Collections.singletonList(cookie("session", "", 0)));
        assertFalse(jar.header().contains("session="));
        NativeCookies.Ticket anonymousPath = jar.reserve("/api/public-media/synthetic");
        assertThrows(Exception.class, () -> jar.apply(anonymousPath, Collections.singletonList(cookie("session", repeat('d'), 300))));
        NativeCookies.Ticket next = jar.reserve("/api/account/challenge");
        assertThrows(Exception.class, () -> jar.apply(next, Collections.singletonList(cookie("challenge", repeat('e'), 301))));
        assertThrows(Exception.class, () -> jar.apply(next, Collections.singletonList(cookie("challenge", repeat('e'), 300) + "; Domain=0xdmme.app")));
    }

    @Test public void usesNonexportableDeviceKeyAndRejectsCiphertextCorruption() throws Exception {
        String namespace = "synthetic-" + UUID.randomUUID();
        EncryptedCookieStore store = store(namespace);
        new NativeCookies(store);
        assertEquals(0, context.getApplicationInfo().flags & ApplicationInfo.FLAG_ALLOW_BACKUP);
        KeyStore keys = KeyStore.getInstance("AndroidKeyStore");
        keys.load(null);
        SecretKey key = ((KeyStore.SecretKeyEntry) keys.getEntry("0xdmme.native." + namespace, null)).getSecretKey();
        assertNull(key.getEncoded());
        File file = new File(context.getNoBackupFilesDir(), "0xdmme-native-" + namespace + ".bin");
        assertTrue(file.length() >= 30);
        try (RandomAccessFile ciphertext = new RandomAccessFile(file, "rw")) {
            long last = ciphertext.length() - 1;
            ciphertext.seek(last);
            int value = ciphertext.readUnsignedByte();
            ciphertext.seek(last);
            ciphertext.writeByte(value ^ 1);
        }
        assertThrows(Exception.class, () -> new NativeCookies(new EncryptedCookieStore(context, namespace)));
    }
}
