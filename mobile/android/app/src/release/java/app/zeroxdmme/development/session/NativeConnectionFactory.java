package app.zeroxdmme.development.session;

import android.content.Context;

/** Release composition has no configurable destination or trust override. */
final class NativeConnectionFactory {
    private NativeConnectionFactory() {}
    static NativeSession create(Context context) { return new NativeSession(context); }
}
