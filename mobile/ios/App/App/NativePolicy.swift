import Foundation
import CoreFoundation

enum NativeFailure: Error { case unavailable }

/** Native validation is independent of the WebView's TypeScript checks. */
enum NativePolicy {
    static let service = "https://0xdmme.app"
    static let requestBytes = 8_400_000
    static let responseBytes = 256 * 1024 * 1024
    static let chunkBytes = 32 * 1024

    struct Message {
        let call: String
        let document: String
        let operation: String
        let request: [String: Any]

        init(_ input: String) throws {
            guard input.utf16.count <= 11_210_000, let bytes = input.data(using: .utf8),
                  let value = try JSONSerialization.jsonObject(with: bytes) as? [String: Any] else { throw NativeFailure.unavailable }
            try NativePolicy.keys(value, ["call", "document", "operation", "request"])
            call = try NativePolicy.id(value["call"])
            document = try NativePolicy.id(value["document"])
            operation = try NativePolicy.text(value["operation"], 6)
            guard ["hello", "open", "read", "cancel"].contains(operation),
                  let body = value["request"] as? [String: Any] else { throw NativeFailure.unavailable }
            request = body
        }
    }

    struct Request {
        let id: String
        let path: String
        let method: String
        let credentials: Bool
        let headers: [String: String]
        let body: Data?
        var live: Bool { ["/api/account/messages/live", "/api/communities/ranking-events"].contains(path.components(separatedBy: "?")[0]) }

        init(_ value: [String: Any]) throws {
            let fields = Set(value.keys)
            let required: Set<String> = ["id", "path", "method", "credentials", "headers"]
            guard fields == required || fields == required.union(["bodyBase64"]) else { throw NativeFailure.unavailable }
            id = try NativePolicy.id(value["id"])
            path = try NativePolicy.path(NativePolicy.text(value["path"], 2048))
            method = try NativePolicy.text(value["method"], 4)
            let policy = try NativePolicy.text(value["credentials"], 11)
            guard ["GET", "HEAD", "POST"].contains(method), ["same-origin", "omit"].contains(policy),
                  let raw = value["headers"] as? [String: Any], raw.count <= 5 else { throw NativeFailure.unavailable }
            credentials = policy == "same-origin"
            headers = try NativePolicy.headers(raw)
            if let raw = value["bodyBase64"] {
                let text = try NativePolicy.text(raw, 11_200_000)
                guard method == "POST", headers["content-type"] != nil, let decoded = Data(base64Encoded: text),
                      decoded.count <= NativePolicy.requestBytes, decoded.base64EncodedString() == text else { throw NativeFailure.unavailable }
                body = decoded
            } else { body = nil }
        }
    }

    static func keys(_ value: [String: Any], _ expected: Set<String>) throws {
        guard Set(value.keys) == expected else { throw NativeFailure.unavailable }
    }

    static func text(_ input: Any?, _ maximum: Int) throws -> String {
        guard let value = input as? String, value.utf16.count <= maximum else { throw NativeFailure.unavailable }
        return value
    }

    static func id(_ input: Any?) throws -> String {
        let value = try text(input, 36)
        guard matches(value, "^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$") else { throw NativeFailure.unavailable }
        return value
    }

    static func integer(_ input: Any?, minimum: Int, maximum: Int) throws -> Int {
        guard let value = input as? NSNumber, CFGetTypeID(value) != CFBooleanGetTypeID(),
              !["f", "d"].contains(String(cString: value.objCType)),
              value.int64Value >= minimum, value.int64Value <= maximum else { throw NativeFailure.unavailable }
        return value.intValue
    }

    static func matches(_ value: String, _ pattern: String) -> Bool {
        value.range(of: pattern, options: .regularExpression) != nil
    }

    private static func path(_ value: String) throws -> String {
        let raw = value.components(separatedBy: "?")[0]
        guard matches(value, "^/api/(account|communities|public-profiles|public-media)(/.*|\\?.*|)$"),
              !value.unicodeScalars.contains(where: { CharacterSet.controlCharacters.contains($0) }),
              !value.contains("\\"), !value.contains("#"), !value.hasSuffix("?"),
              !raw.contains("//"), !raw.contains("%"), !raw.contains(".."),
              let target = URL(string: service + value), target.absoluteString == service + value,
              target.scheme == "https", target.host == "0xdmme.app", target.port == nil else { throw NativeFailure.unavailable }
        return value
    }

    private static func headers(_ input: [String: Any]) throws -> [String: String] {
        var result: [String: String] = [:]
        for (name, raw) in input {
            let value = try text(raw, 128)
            let valid: Bool
            switch name {
            case "accept": valid = value == "text/event-stream"
            case "content-type": valid = matches(value, "(?i)^application/json(;\\s*charset=utf-8)?$")
            case "x-hash-talk-csrf": valid = matches(value, "^[a-f0-9]{64}$")
            case "x-0xdmme-attachment-id", "x-0xdmme-vault-id": valid = matches(value, "^[a-f0-9-]{36}$")
            default: valid = false
            }
            guard valid else { throw NativeFailure.unavailable }
            result[name] = value
        }
        return result
    }
}
