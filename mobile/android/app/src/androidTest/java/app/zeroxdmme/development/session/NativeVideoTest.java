package app.zeroxdmme.development.session;

import static org.junit.Assert.*;
import java.io.IOException;
import java.util.Arrays;
import java.util.UUID;
import org.json.JSONObject;
import org.junit.Test;

/** Synthetic memory/wire regressions, without opening an account or a message. */
public class NativeVideoTest {
    @Test public void memorySourceChecksOffsetsAndWipesItsOwnedBytesOnClose() throws Exception {
        byte[] bytes = {1, 2, 3, 4}, result = new byte[6];
        NativeVideoSource source = new NativeVideoSource(bytes);
        assertEquals(4, source.getSize());
        assertEquals(3, source.readAt(1, result, 2, 4));
        assertArrayEquals(new byte[]{0, 0, 2, 3, 4, 0}, result);
        assertEquals(-1, source.readAt(4, result, 0, 1));
        assertEquals(0, source.readAt(4, result, 0, 0));
        assertThrows(IOException.class, () -> source.readAt(-1, result, 0, 1));
        assertThrows(IOException.class, () -> source.readAt(0, result, 5, 2));
        source.close(); source.close();
        assertArrayEquals(new byte[4], bytes);
        assertThrows(IOException.class, source::getSize);
        assertThrows(IOException.class, () -> source.readAt(0, result, 0, 1));
    }
    @Test public void presentationChunksEnforceCanonicalEncodingOffsetsAndRemainingBytes() throws Exception {
        JSONObject input = new JSONObject().put("id", UUID.randomUUID().toString()).put("offset", 0).put("bytes", "AQID");
        byte[] valid = NativePolicy.mediaChunk(input, 0, 3);
        assertArrayEquals(new byte[]{1, 2, 3}, valid); Arrays.fill(valid, (byte) 0);
        assertThrows(Exception.class, () -> NativePolicy.mediaChunk(input, 1, 3));
        assertThrows(Exception.class, () -> NativePolicy.mediaChunk(input, 0, 2));
        for (String invalid : new String[]{"", "AQID\n", "AR==", "A===", "!"}) {
            input.put("bytes", invalid);
            assertThrows(Exception.class, () -> NativePolicy.mediaChunk(input, 0, 65536));
        }
    }
}
