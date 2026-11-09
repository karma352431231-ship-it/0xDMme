import Foundation

/** HTTP response validation, independent of tokens and stream lifecycle. */
struct NativeResponse {
    let visible: [String: Any]
    let cookies: [String]
    let expected: Int?
    let live: Bool

    init(_ response: URLResponse, request: NativePolicy.Request) throws {
        guard let http = response as? HTTPURLResponse, (200...599).contains(http.statusCode),
              !(300...399).contains(http.statusCode),
              http.value(forHTTPHeaderField: "content-encoding").map({ $0.lowercased() == "identity" }) ?? true else { throw NativeFailure.unavailable }
        var headers: [String: String] = [:]
        for name in ["content-type", "content-length", "cache-control", "retry-after"] {
            guard let value = http.value(forHTTPHeaderField: name) else { continue }
            guard value.utf16.count <= 256, !value.unicodeScalars.contains(where: { CharacterSet.controlCharacters.contains($0) }) else { throw NativeFailure.unavailable }
            headers[name] = value
        }
        if let raw = headers["content-length"] {
            guard NativePolicy.matches(raw, "^(0|[1-9][0-9]{0,9})$"), let length = Int(raw), length <= NativePolicy.responseBytes else { throw NativeFailure.unavailable }
            expected = request.method == "HEAD" ? 0 : length
        } else { expected = request.method == "HEAD" ? 0 : nil }
        let type = (headers["content-type"] ?? "").components(separatedBy: ";")[0].trimmingCharacters(in: .whitespaces).lowercased()
        live = request.live && type == "text/event-stream"
        // The only admitted cookies have no comma-bearing values/Expires.
        // Foundation may combine repeated response fields into this one value.
        cookies = http.value(forHTTPHeaderField: "set-cookie")?.components(separatedBy: ",").map { $0.trimmingCharacters(in: .whitespaces) } ?? []
        guard cookies.count <= 3 else { throw NativeFailure.unavailable }
        visible = ["status": http.statusCode, "headers": headers]
    }
}
