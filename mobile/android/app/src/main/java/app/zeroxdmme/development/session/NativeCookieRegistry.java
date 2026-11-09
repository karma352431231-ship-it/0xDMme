package app.zeroxdmme.development.session;

import android.content.Context;

/** One cookie owner per app process, including overlapping Activity disposal
 * and creation. It retains at most three tokens, no Activity, tasks or timers.
 * Cookie access still verifies OS unlock and every write is device-encrypted.
 */
final class NativeCookieRegistry {
    private static NativeCookies owner;
    private static boolean failed;
    private NativeCookieRegistry() {}

    static synchronized NativeCookies open(Context context) throws Exception {
        if (failed) throw NativePolicy.failure();
        if (owner != null) return owner;
        try {
            owner = new NativeCookies(new EncryptedCookieStore(context.getApplicationContext()));
            return owner;
        } catch (Exception unavailable) {
            failed = true;
            throw unavailable;
        }
    }
}
