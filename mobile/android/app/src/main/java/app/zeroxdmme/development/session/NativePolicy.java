package app.zeroxdmme.development.session;

import android.util.Base64;
import java.net.URI;
import java.util.Arrays;
import java.util.Collections;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import org.json.JSONObject;
import org.json.JSONTokener;

/** Native trust boundary. No JavaScript-provided destination or cookie is accepted. */
final class NativePolicy {
    static final int REQUEST_BYTES = 8_400_000;
    static final long RESPONSE_BYTES = 256L * 1024 * 1024;
    static final int CHUNK_BYTES = 128 * 1024;
    static final int WIRE_CHARACTERS = 11_210_000;
    static final String SERVICE = "https://0xdmme.app";

    static final class Request {
        final String id;
        final String path;
        final String method;
        final boolean credentials;
        final Map<String, String> headers;
        final byte[] body;

        Request(JSONObject input) throws Exception {
            exact(input, "id", "path", "method", "credentials", "headers", "bodyBase64");
            id = identifier(input, "id");
            path = path(text(input, "path", 2048));
            method = text(input, "method", 4);
            if (!Arrays.asList("GET", "HEAD", "POST").contains(method)) throw failure();
            String policy = text(input, "credentials", 11);
            if (!Arrays.asList("same-origin", "omit").contains(policy)) throw failure();
            credentials = policy.equals("same-origin");
            headers = headers(record(input, "headers"));
            if (headers.containsKey("x-0xdmme-call-wake")
                && (!method.equals("POST") || !path.equals("/api/account/messages/live"))) throw failure();
            body = input.has("bodyBase64") ? body(text(input, "bodyBase64", 11_200_000)) : null;
            if (body != null && (!method.equals("POST") || !headers.containsKey("content-type"))) throw failure();
        }

        boolean live() {
            return Arrays.asList("/api/account/messages/live", "/api/communities/ranking-events").contains(path.split("\\?", 2)[0]);
        }
    }

    static final class Message {
        final String call;
        final String document;
        final String operation;
        final JSONObject request;

        Message(String input) throws Exception {
            if (input.length() > WIRE_CHARACTERS) throw failure();
            JSONObject message = parse(input);
            exact(message, "call", "document", "operation", "request");
            if (message.length() != 4) throw failure();
            call = identifier(message, "call");
            document = identifier(message, "document");
            operation = text(message, "operation", 16);
            if (!Arrays.asList("hello", "startup-timing", "open", "read", "cancel", "view-begin", "view-append", "view-show", "view-active", "view-close", "view-frame", "video-begin", "video-append", "video-show", "video-active", "video-close", "video-frame", "file-begin", "file-append", "file-save", "file-close").contains(operation)) throw failure();
            request = record(message, "request");
        }
    }

    static Exception failure() {
        return new Exception("Native API exchange failed.");
    }

    static String identifier(JSONObject value, String field) throws Exception {
        String id = text(value, field, 36);
        UUID parsed = UUID.fromString(id);
        if (!parsed.toString().equals(id) || parsed.version() != 4 || parsed.variant() != 2) throw failure();
        return id;
    }

    static JSONObject parse(String input) throws Exception {
        // JSONTokener uses NUL as its EOF sentinel; raw control characters are
        // never emitted by the wire serializer (escaped string data is valid).
        for (int i = 0; i < input.length(); i++)
            if (input.charAt(i) < 32 && !Character.isWhitespace(input.charAt(i))) throw failure();
        JSONTokener reader = new JSONTokener(input);
        Object value = reader.nextValue();
        if (!(value instanceof JSONObject) || reader.nextClean() != 0) throw failure();
        return (JSONObject) value;
    }

    static String text(JSONObject value, String field, int maximum) throws Exception {
        Object input = value.opt(field);
        if (!(input instanceof String)) throw failure();
        String text = (String) input;
        if (text.length() > maximum) throw failure();
        return text;
    }

    static JSONObject record(JSONObject value, String field) throws Exception {
        Object input = value.opt(field);
        if (!(input instanceof JSONObject)) throw failure();
        return (JSONObject) input;
    }

    static void exact(JSONObject value, String... allowed) throws Exception {
        Iterator<String> fields = value.keys();
        while (fields.hasNext())
            if (!Arrays.asList(allowed).contains(fields.next())) throw failure();
    }

    static int integer(JSONObject input, String key, int minimum, int maximum) throws Exception {
        Object raw = input.opt(key);
        if (!(raw instanceof Integer) && !(raw instanceof Long)) throw failure();
        long value = ((Number) raw).longValue();
        if (value < minimum || value > maximum) throw failure();
        return (int) value;
    }

    static int readBytes(JSONObject input) throws Exception {
        exact(input, "id", "bytes");
        if (input.length() != 2) throw failure();
        Object value = input.opt("bytes");
        if (!(value instanceof Integer)) throw failure();
        int size = (Integer) value;
        if (size < 1 || size > CHUNK_BYTES) throw failure();
        return size;
    }

    /** Shared bounded presentation wire contract; the caller must wipe the chunk. */
    static byte[] mediaChunk(JSONObject input, int offset, int remaining) throws Exception {
        exact(input, "id", "offset", "bytes");
        int requested = integer(input, "offset", 0, 10_000_000);
        String text = text(input, "bytes", 90_000);
        byte[] chunk = Base64.decode(text, Base64.NO_WRAP);
        if (chunk.length == 0 || chunk.length > 65_536 || chunk.length > remaining || requested != offset
            || !Base64.encodeToString(chunk, Base64.NO_WRAP).equals(text)) {
            Arrays.fill(chunk, (byte) 0);
            throw failure();
        }
        return chunk;
    }

    private static String path(String input) throws Exception {
        if (!input.matches("^/api/(account|communities|public-profiles|public-media)(/.*|\\?.*|)$")) throw failure();
        for (int i = 0; i < input.length(); i++)
            if (Character.isISOControl(input.charAt(i)) || input.charAt(i) == '\\' || input.charAt(i) == '#') throw failure();
        URI target = new URI(SERVICE).resolve(new URI(input));
        String path = target.getRawPath();
        if ("".equals(target.getRawQuery())) throw failure();
        String suffix = target.getRawQuery() == null ? "" : "?" + target.getRawQuery();
        if (!SERVICE.equals(target.getScheme() + "://" + target.getRawAuthority()) || !input.equals(path + suffix)) throw failure();
        if (path.contains("//") || path.contains("%") || path.contains("..")) throw failure();
        return input;
    }

    private static Map<String, String> headers(JSONObject input) throws Exception {
        if (input.length() > 5) throw failure();
        Map<String, String> result = new LinkedHashMap<>();
        Iterator<String> names = input.keys();
        while (names.hasNext()) {
            String name = names.next();
            String value = text(input, name, 128);
            if (!header(name, value)) throw failure();
            result.put(name, value);
        }
        return Collections.unmodifiableMap(result);
    }

    private static boolean header(String name, String value) {
        switch (name) {
            case "accept": return value.equals("text/event-stream");
            case "content-type": return value.matches("(?i)application/json(;\\s*charset=utf-8)?");
            case "x-hash-talk-csrf": return value.matches("[a-f0-9]{64}");
            case "x-0xdmme-call-wake": return value.equals("1");
            case "x-0xdmme-attachment-id":
            case "x-0xdmme-vault-id": return value.matches("[a-f0-9-]{36}");
            default: return false;
        }
    }

    private static byte[] body(String input) throws Exception {
        byte[] value = Base64.decode(input, Base64.NO_WRAP);
        if (value.length > REQUEST_BYTES || !Base64.encodeToString(value, Base64.NO_WRAP).equals(input)) throw failure();
        return value;
    }
}
