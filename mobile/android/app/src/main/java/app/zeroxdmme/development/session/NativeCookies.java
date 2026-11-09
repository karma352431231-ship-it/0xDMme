package app.zeroxdmme.development.session;

import java.nio.ByteBuffer;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import org.json.JSONArray;
import org.json.JSONObject;

/** Sole owner of the three private account cookies and response supersession.
 * Neither the WebView jar nor CookieHandler/HTTPCookieStorage participates.
 * The native session serializes apply with cancellation before acknowledging it.
 */
final class NativeCookies {
    private static final String SESSION = "__Host-hash-talk-session";
    private static final String CHALLENGE = "__Host-hash-talk-challenge";
    private static final String RETURN = "__Host-hash-talk-return";
    private static final List<String> NAMES = Collections.unmodifiableList(Arrays.asList(SESSION, CHALLENGE, RETURN));
    private final EncryptedCookieStore store;
    private final Map<String, Cookie> cookies = new LinkedHashMap<>();
    private final Map<String, Long> latest = new LinkedHashMap<>();
    private long sequence;
    private boolean failed;

    static final class Ticket {
        final long sequence;
        final Set<String> slots;
        Ticket(long sequence, Set<String> slots) {
            this.sequence = sequence;
            this.slots = slots;
        }
    }

    private static final class Cookie {
        final String value;
        final long expires;
        Cookie(String value, long expires) {
            this.value = value;
            this.expires = expires;
        }
    }

    NativeCookies(EncryptedCookieStore store) throws Exception {
        this.store = store;
        byte[] clear = store.load();
        try {
            String text = StandardCharsets.UTF_8.newDecoder()
                .onMalformedInput(CodingErrorAction.REPORT)
                .onUnmappableCharacter(CodingErrorAction.REPORT)
                .decode(ByteBuffer.wrap(clear)).toString();
            restore(NativePolicy.parse(text));
        } finally {
            Arrays.fill(clear, (byte) 0);
        }
    }

    synchronized Ticket reserve(String path) throws Exception {
        healthy();
        sequence = Math.addExact(sequence, 1);
        Set<String> slots = slots(path.split("\\?", 2)[0]);
        for (String name : slots) latest.put(name, sequence);
        return new Ticket(sequence, slots);
    }

    synchronized String header() throws Exception {
        healthy();
        store.unlocked();
        StringBuilder result = new StringBuilder();
        long now = System.currentTimeMillis();
        for (String name : NAMES) {
            Cookie cookie = cookies.get(name);
            if (cookie == null || cookie.expires <= now) continue;
            if (result.length() > 0) result.append("; ");
            result.append(name).append('=').append(cookie.value);
        }
        return result.toString();
    }

    synchronized void apply(Ticket ticket, List<String> headers) throws Exception {
        healthy();
        if (headers.isEmpty()) return;
        if (headers.size() > 3) throw NativePolicy.failure();
        Map<String, Cookie> next = new LinkedHashMap<>(cookies);
        Set<String> changed = new HashSet<>();
        long now = System.currentTimeMillis();
        for (String header : headers) {
            Map.Entry<String, Cookie> cookie = parse(header, now);
            String name = cookie.getKey();
            if (!ticket.slots.contains(name) || !Long.valueOf(ticket.sequence).equals(latest.get(name)) || !changed.add(name)) throw NativePolicy.failure();
            if (cookie.getValue().expires <= now) next.remove(name);
            else next.put(name, cookie.getValue());
        }
        byte[] clear = serialized(next);
        try {
            store.save(clear);
            cookies.clear();
            cookies.putAll(next);
        } catch (Exception error) {
            failed = true;
            throw error;
        } finally {
            Arrays.fill(clear, (byte) 0);
        }
    }

    private void healthy() throws Exception {
        if (failed) throw NativePolicy.failure();
    }

    private void restore(JSONObject data) throws Exception {
        NativePolicy.exact(data, "version", "cookies");
        if (data.length() != 2 || !Integer.valueOf(1).equals(data.opt("version"))) throw NativePolicy.failure();
        Object raw = data.opt("cookies");
        if (!(raw instanceof JSONArray) || ((JSONArray) raw).length() > 3) throw NativePolicy.failure();
        JSONArray rows = (JSONArray) raw;
        for (int i = 0; i < rows.length(); i++) {
            Object row = rows.get(i);
            if (!(row instanceof JSONObject)) throw NativePolicy.failure();
            restoreCookie((JSONObject) row);
        }
    }

    private void restoreCookie(JSONObject row) throws Exception {
        NativePolicy.exact(row, "name", "value", "expires");
        if (row.length() != 3) throw NativePolicy.failure();
        String name = NativePolicy.text(row, "name", 32);
        String value = NativePolicy.text(row, "value", 64);
        Object expiry = row.opt("expires");
        if (!NAMES.contains(name) || cookies.containsKey(name) || !value.matches("[a-f0-9]{64}") || !(expiry instanceof Long || expiry instanceof Integer)) throw NativePolicy.failure();
        long expires = ((Number) expiry).longValue();
        if (expires < 0 || expires > 253402300799999L) throw NativePolicy.failure();
        cookies.put(name, new Cookie(value, expires));
    }

    private static Map.Entry<String, Cookie> parse(String header, long now) throws Exception {
        if (header.length() > 512) throw NativePolicy.failure();
        String[] parts = header.split(";", -1);
        if (parts.length != 6) throw NativePolicy.failure();
        int delimiter = parts[0].indexOf('=');
        if (delimiter < 1) throw NativePolicy.failure();
        String name = parts[0].substring(0, delimiter);
        String value = parts[0].substring(delimiter + 1);
        if (!NAMES.contains(name)) throw NativePolicy.failure();
        Map<String, String> attributes = new LinkedHashMap<>();
        for (int i = 1; i < parts.length; i++) attribute(attributes, parts[i]);
        long age = maxAge(attributes, name);
        if (!(age == 0 ? value.isEmpty() : value.matches("[a-f0-9]{64}"))) throw NativePolicy.failure();
        return new java.util.AbstractMap.SimpleImmutableEntry<>(name, new Cookie(value, age == 0 ? 0 : Math.addExact(now, age * 1000)));
    }

    private static void attribute(Map<String, String> attributes, String part) throws Exception {
        String[] pair = part.trim().split("=", 2);
        String name = pair[0].toLowerCase(Locale.ROOT);
        if (!Arrays.asList("path", "httponly", "secure", "samesite", "max-age").contains(name) || attributes.containsKey(name)) throw NativePolicy.failure();
        attributes.put(name, pair.length == 1 ? "" : pair[1]);
    }

    private static long maxAge(Map<String, String> attributes, String name) throws Exception {
        if (attributes.size() != 5 || !"/".equals(attributes.get("path")) || !"".equals(attributes.get("httponly")) || !"".equals(attributes.get("secure")) || !"strict".equalsIgnoreCase(attributes.get("samesite"))) throw NativePolicy.failure();
        String value = attributes.get("max-age");
        if (value == null || !value.matches("0|[1-9][0-9]{0,7}")) throw NativePolicy.failure();
        long age = Long.parseLong(value);
        if (age > (name.equals(SESSION) ? 160L * 24 * 60 * 60 : 300)) throw NativePolicy.failure();
        return age;
    }

    private static Set<String> slots(String path) {
        Set<String> result = new HashSet<>();
        switch (path) {
            case "/api/account/challenge":
            case "/api/account/handoff-challenge":
            case "/api/account/handoff-sign": result.add(CHALLENGE); break;
            case "/api/account/login": result.add(SESSION); result.add(CHALLENGE); break;
            case "/api/account/handoff-start":
            case "/api/account/handoff-cancel": result.add(RETURN); break;
            case "/api/account/handoff-confirm": result.add(SESSION); result.add(RETURN); break;
            case "/api/account/logout":
            case "/api/account/enrollment-join": result.add(SESSION); break;
            default: break;
        }
        return Collections.unmodifiableSet(result);
    }

    private static byte[] serialized(Map<String, Cookie> cookies) throws Exception {
        JSONArray rows = new JSONArray();
        for (String name : NAMES) {
            Cookie cookie = cookies.get(name);
            if (cookie == null) continue;
            rows.put(new JSONObject().put("name", name).put("value", cookie.value).put("expires", cookie.expires));
        }
        return new JSONObject().put("version", 1).put("cookies", rows).toString().getBytes(StandardCharsets.UTF_8);
    }
}
