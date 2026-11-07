package app.zeroxdmme.development.session;

import android.app.KeyguardManager;
import android.content.Context;
import android.os.Build;
import android.os.UserManager;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.AtomicFile;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.util.Arrays;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/** Device-only key custody and atomic encrypted persistence, never a cookie API.
 * The account cookie policy and ordering belong to NativeCookies.
 */
final class EncryptedCookieStore {
    private final Context context;
    private final String alias;
    private final String namespace;
    private final AtomicFile file;
    private final byte[] aad;
    private final KeyStore keys;
    private SecretKey key;

    EncryptedCookieStore(Context context) throws Exception {
        this(context, "session-v1");
    }

    EncryptedCookieStore(Context context, String namespace) throws Exception {
        if (!namespace.matches("session-v1|synthetic-[a-f0-9-]{36}")) throw NativePolicy.failure();
        this.context = context.getApplicationContext();
        this.namespace = namespace;
        alias = "0xdmme.native." + namespace;
        file = new AtomicFile(new File(this.context.getNoBackupFilesDir(), "0xdmme-native-" + namespace + ".bin"));
        aad = ("0xDMme native cookies v1:" + this.context.getPackageName() + ":" + namespace).getBytes(StandardCharsets.UTF_8);
        keys = KeyStore.getInstance("AndroidKeyStore");
        keys.load(null);
    }

    byte[] load() throws Exception {
        unlocked();
        boolean existing = exists();
        boolean keyExists = keys.containsAlias(alias);
        if (existing != keyExists) throw NativePolicy.failure();
        if (!existing) {
            key = createKey();
            byte[] empty = "{\"version\":1,\"cookies\":[]}".getBytes(StandardCharsets.UTF_8);
            save(empty);
            return empty;
        }
        Object entry = keys.getEntry(alias, null);
        if (!(entry instanceof KeyStore.SecretKeyEntry)) throw NativePolicy.failure();
        key = ((KeyStore.SecretKeyEntry) entry).getSecretKey();
        byte[] bytes = read();
        if (bytes.length < 30 || bytes[0] != 1) throw NativePolicy.failure();
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(128, Arrays.copyOfRange(bytes, 1, 13)));
        cipher.updateAAD(aad);
        byte[] clear = cipher.doFinal(bytes, 13, bytes.length - 13);
        if (clear.length > 4096) {
            Arrays.fill(clear, (byte) 0);
            throw NativePolicy.failure();
        }
        return clear;
    }

    void save(byte[] clear) throws Exception {
        unlocked();
        if (key == null || clear.length > 4096) throw NativePolicy.failure();
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, key);
        cipher.updateAAD(aad);
        byte[] iv = cipher.getIV();
        if (iv.length != 12) throw NativePolicy.failure();
        byte[] sealed = cipher.doFinal(clear);
        FileOutputStream output = null;
        try {
            output = file.startWrite();
            output.write(1);
            output.write(iv);
            output.write(sealed);
            file.finishWrite(output);
        } catch (Exception failure) {
            if (output != null) file.failWrite(output);
            throw failure;
        }
    }

    private SecretKey createKey() throws Exception {
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        KeyGenParameterSpec.Builder spec = new KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
            .setKeySize(256)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE);
        if (Build.VERSION.SDK_INT >= 28) spec.setUnlockedDeviceRequired(true);
        generator.init(spec.build());
        return generator.generateKey();
    }

    void unlocked() throws Exception {
        UserManager user = (UserManager) context.getSystemService(Context.USER_SERVICE);
        KeyguardManager guard = (KeyguardManager) context.getSystemService(Context.KEYGUARD_SERVICE);
        if (user == null || !user.isUserUnlocked() || guard == null || guard.isDeviceLocked()) throw NativePolicy.failure();
    }

    private boolean exists() {
        File base = file.getBaseFile();
        return base.exists() || new File(base.getPath() + ".bak").exists() || new File(base.getPath() + ".new").exists();
    }

    private byte[] read() throws Exception {
        try (FileInputStream input = file.openRead(); ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] part = new byte[1024];
            for (;;) {
                int count = input.read(part);
                if (count == -1) return output.toByteArray();
                if (count == 0 || output.size() + count > 8192) throw NativePolicy.failure();
                output.write(part, 0, count);
            }
        }
    }

    /** Only instrumentation's isolated synthetic namespace can be removed. */
    void eraseSynthetic() throws Exception {
        if (!namespace.startsWith("synthetic-")) throw NativePolicy.failure();
        file.delete();
        keys.deleteEntry(alias);
        key = null;
    }
}
