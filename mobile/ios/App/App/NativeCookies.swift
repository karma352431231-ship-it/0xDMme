import Foundation

/** Process-wide owner of the three private session tokens and their
 * supersession. The HTTP owner serializes cookie installation and cancellation.
 */
final class NativeCookies {
    private static let session = "__Host-hash-talk-session"
    private static let challenge = "__Host-hash-talk-challenge"
    private static let returned = "__Host-hash-talk-return"
    private static let names = [session, challenge, returned]
    struct Ticket { let sequence: UInt64; let slots: Set<String> }
    private struct Cookie { let value: String; let expires: Int }
    private let store = NativeCookieStore()
    private let lock = NSLock()
    private var cookies: [String: Cookie] = [:]
    private var latest: [String: UInt64] = [:]
    private var sequence: UInt64 = 0
    private var failed = false

    init() throws {
        let bytes = try store.load()
        guard let raw = try JSONSerialization.jsonObject(with: bytes) as? [String: Any] else { throw NativeFailure.unavailable }
        try NativePolicy.keys(raw, ["version", "cookies"])
        guard try NativePolicy.integer(raw["version"], minimum: 1, maximum: 1) == 1,
              let rows = raw["cookies"] as? [[String: Any]], rows.count <= 3 else { throw NativeFailure.unavailable }
        for row in rows {
            try NativePolicy.keys(row, ["name", "value", "expires"])
            let name = try NativePolicy.text(row["name"], 32)
            let value = try NativePolicy.text(row["value"], 64)
            let expiry = try NativePolicy.integer(row["expires"], minimum: 0, maximum: 253402300799999)
            guard Self.names.contains(name), cookies[name] == nil, NativePolicy.matches(value, "^[a-f0-9]{64}$") else { throw NativeFailure.unavailable }
            cookies[name] = Cookie(value: value, expires: expiry)
        }
    }

    func reserve(_ path: String) throws -> Ticket {
        lock.lock(); defer { lock.unlock() }
        guard !failed, sequence < UInt64.max else { throw NativeFailure.unavailable }
        sequence += 1
        let slots = Self.slots(path.components(separatedBy: "?")[0])
        for name in slots { latest[name] = sequence }
        return Ticket(sequence: sequence, slots: slots)
    }

    func header() throws -> String {
        lock.lock(); defer { lock.unlock() }
        guard !failed else { throw NativeFailure.unavailable }
        try store.assertUnlocked()
        let now = Self.now()
        return Self.names.compactMap { name in
            guard let cookie = cookies[name], cookie.expires > now else { return nil }
            return "\(name)=\(cookie.value)"
        }.joined(separator: "; ")
    }

    func apply(_ ticket: Ticket, _ headers: [String]) throws {
        lock.lock(); defer { lock.unlock() }
        guard !failed, headers.count <= 3 else { throw NativeFailure.unavailable }
        if headers.isEmpty { return }
        var next = cookies
        var changed: Set<String> = []
        let now = Self.now()
        for header in headers {
            let (name, cookie) = try Self.parse(header, now)
            guard ticket.slots.contains(name), latest[name] == ticket.sequence,
                  changed.insert(name).inserted else { throw NativeFailure.unavailable }
            if cookie.expires <= now { next.removeValue(forKey: name) }
            else { next[name] = cookie }
        }
        let rows = Self.names.compactMap { name -> [String: Any]? in
            guard let value = next[name] else { return nil }
            return ["name": name, "value": value.value, "expires": value.expires]
        }
        do {
            let bytes = try JSONSerialization.data(withJSONObject: ["version": 1, "cookies": rows])
            try store.save(bytes)
            cookies = next
        } catch { failed = true; throw error }
    }

    private static func parse(_ header: String, _ now: Int) throws -> (String, Cookie) {
        guard header.utf16.count <= 512 else { throw NativeFailure.unavailable }
        let pieces = header.components(separatedBy: ";")
        guard pieces.count == 6 else { throw NativeFailure.unavailable }
        let pair = pieces[0].split(separator: "=", maxSplits: 1, omittingEmptySubsequences: false).map(String.init)
        guard pair.count == 2, names.contains(pair[0]) else { throw NativeFailure.unavailable }
        var attributes: [String: String] = [:]
        for piece in pieces.dropFirst() {
            let item = piece.trimmingCharacters(in: .whitespaces).split(separator: "=", maxSplits: 1, omittingEmptySubsequences: false).map(String.init)
            guard !item.isEmpty else { throw NativeFailure.unavailable }
            let key = item[0].lowercased()
            guard ["path", "httponly", "secure", "samesite", "max-age"].contains(key), attributes[key] == nil else { throw NativeFailure.unavailable }
            attributes[key] = item.count == 1 ? "" : item[1]
        }
        guard attributes.count == 5, attributes["path"] == "/", attributes["httponly"] == "", attributes["secure"] == "",
              attributes["samesite"]?.lowercased() == "strict", let age = attributes["max-age"],
              NativePolicy.matches(age, "^(0|[1-9][0-9]{0,7})$"), let seconds = Int(age),
              seconds <= (pair[0] == session ? 160 * 24 * 60 * 60 : 300),
              (seconds == 0 ? pair[1].isEmpty : NativePolicy.matches(pair[1], "^[a-f0-9]{64}$")) else { throw NativeFailure.unavailable }
        return (pair[0], Cookie(value: pair[1], expires: seconds == 0 ? 0 : now + seconds * 1000))
    }

    private static func slots(_ path: String) -> Set<String> {
        switch path {
        case "/api/account/challenge", "/api/account/handoff-challenge", "/api/account/handoff-sign": return [challenge]
        case "/api/account/login": return [session, challenge]
        case "/api/account/handoff-start", "/api/account/handoff-cancel": return [returned]
        case "/api/account/handoff-confirm": return [session, returned]
        case "/api/account/logout", "/api/account/enrollment-join": return [session]
        default: return []
        }
    }

    private static func now() -> Int { Int(Date().timeIntervalSince1970 * 1000) }
}

/** No WebView, work queue, timer or network task is retained by the registry. */
enum NativeCookieRegistry {
    private static let lock = NSLock()
    private static var owner: NativeCookies?
    private static var failed = false
    static func open() throws -> NativeCookies {
        lock.lock(); defer { lock.unlock() }
        guard !failed else { throw NativeFailure.unavailable }
        if let owner { return owner }
        do {
            let value = try NativeCookies()
            owner = value
            return value
        } catch { failed = true; throw error }
    }
}
