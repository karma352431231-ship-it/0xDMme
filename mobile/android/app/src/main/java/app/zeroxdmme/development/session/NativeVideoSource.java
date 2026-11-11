package app.zeroxdmme.development.session;

import android.media.MediaDataSource;
import java.io.IOException;
import java.util.Arrays;

/** Owns the bounded decrypted input until decoder teardown; no file or URL. */
final class NativeVideoSource extends MediaDataSource {
    private byte[] bytes;
    NativeVideoSource(byte[] bytes) {
        if (bytes.length == 0 || bytes.length > 10_000_000) throw new IllegalArgumentException("Invalid video size.");
        this.bytes = bytes;
    }
    @Override public synchronized int readAt(long position, byte[] target, int offset, int count) throws IOException {
        if (bytes == null) throw new IOException("Video closed.");
        if (position < 0 || offset < 0 || count < 0 || offset > target.length - count) throw new IOException("Invalid video read.");
        if (count == 0) return 0;
        if (position >= bytes.length) return -1;
        int size = (int) Math.min(count, bytes.length - position);
        System.arraycopy(bytes, (int) position, target, offset, size);
        return size;
    }
    @Override public synchronized long getSize() throws IOException {
        if (bytes == null) throw new IOException("Video closed.");
        return bytes.length;
    }
    @Override public synchronized void close() {
        if (bytes != null) Arrays.fill(bytes, (byte) 0);
        bytes = null;
    }
}
