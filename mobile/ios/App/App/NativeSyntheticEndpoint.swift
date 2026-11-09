#if DEBUG && MOBILE_SYNTHETIC_TEST
import Foundation

/** Immutable admission for explicitly packaged synthetic test destinations.
 * No DNS, protected storage or HTTP owner is opened during validation.
 * Physical fixtures use a private IPv4 address, pinned test CA and a separate
 * native-only admission token; real account authentication still runs normally.
 */
struct NativeSyntheticEndpoint {
    let url: URL
    let admission: String?

    init(_ raw: [String: Any]) throws {
        let physical = raw["kind"] as? String == "synthetic-native-physical-v1"
        try NativePolicy.keys(raw, physical ? ["kind", "url", "admission"] : ["kind", "url"])
        guard physical || raw["kind"] as? String == "synthetic-native-v1",
              let text = raw["url"] as? String, text.utf8.count <= 256,
              let url = URL(string: text), url.absoluteString == text,
              url.scheme == "https", let host = url.host,
              let port = url.port, (45111...45119).contains(port), url.path == "/",
              url.query == nil, url.fragment == nil, url.user == nil, url.password == nil else {
            throw NativeFailure.unavailable
        }
        if physical {
            guard Self.privateIPv4(host), let value = raw["admission"] as? String, value.utf8.count == 64,
                  NativePolicy.matches(value, "^[a-f0-9]{64}$") else { throw NativeFailure.unavailable }
            admission = value
        } else {
            guard host == "127.0.0.1" else { throw NativeFailure.unavailable }
            admission = nil
        }
        self.url = url
    }

    private static func privateIPv4(_ host: String) -> Bool {
        let fields = host.split(separator: ".", omittingEmptySubsequences: false)
        guard fields.count == 4 else { return false }
        var bytes: [Int] = []
        for field in fields {
            guard NativePolicy.matches(String(field), "^(0|[1-9][0-9]{0,2})$"),
                  let value = Int(field), value <= 255 else { return false }
            bytes.append(value)
        }
        return bytes[0] == 10 || (bytes[0] == 172 && (16...31).contains(bytes[1])) || (bytes[0] == 192 && bytes[1] == 168)
    }
}
#endif
