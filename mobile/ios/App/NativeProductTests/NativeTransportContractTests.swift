import Foundation
import XCTest
@testable import App

/** Exercises the independent Swift request/response and body-buffer contracts.
 * No Keychain, product account or real network is opened by these cases.
 * The installed iPhone target owns execution; compilation is not acceptance.
 */
final class NativeTransportContractTests: XCTestCase {
    private func request(_ body: Data? = nil) -> [String: Any] {
        var value: [String: Any] = [
            "id": UUID().uuidString.lowercased(),
            "path": "/api/account/messages/page?after=%2B",
            "method": "POST",
            "credentials": "same-origin",
            "headers": ["content-type": "application/json", "x-hash-talk-csrf": String(repeating: "a", count: 64)]
        ]
        if let body { value["bodyBase64"] = body.base64EncodedString() }
        return value
    }

    func testSignedUTF8SurvivesNativeValidationAndUntrustedFieldsAreRejected() throws {
        let bytes = Data("{\"message\":\"Synthetic Unicode — 测试\",\"signature\":\"unchanged\"}".utf8)
        let input = request(bytes)
        let validated = try NativePolicy.Request(input)
        XCTAssertEqual(validated.body, bytes)
        XCTAssertEqual(validated.path, "/api/account/messages/page?after=%2B")
        XCTAssertTrue(validated.credentials)
        for name in ["url", "origin", "cookies", "redirect"] {
            var changed = input
            changed[name] = "untrusted"
            XCTAssertThrowsError(try NativePolicy.Request(changed), name)
        }
        for name in ["cookie", "origin", "authorization", "host"] {
            var changed = input
            changed["headers"] = [name: "untrusted"]
            XCTAssertThrowsError(try NativePolicy.Request(changed), name)
        }
        var changed = input
        changed["method"] = "GET"
        XCTAssertThrowsError(try NativePolicy.Request(changed))
        changed = input
        changed["bodyBase64"] = bytes.base64EncodedString() + "\n"
        XCTAssertThrowsError(try NativePolicy.Request(changed))
    }

    func testCanonicalPathsWireIdentityAndTypedLimitsFailClosed() throws {
        for path in ["https://untrusted.invalid/api/account/session", "//untrusted.invalid/api/account/session", "/api/account/../session", "/api/account/%2e%2e/session", "/api/account/session#fragment", "/api/account//session", "/api/account/session?", "/api/account/session\n"] {
            var input = request()
            input["path"] = path
            XCTAssertThrowsError(try NativePolicy.Request(input), path)
        }
        XCTAssertThrowsError(try NativePolicy.integer(true, minimum: 0, maximum: 10))
        XCTAssertThrowsError(try NativePolicy.integer(1.5, minimum: 0, maximum: 10))
        XCTAssertThrowsError(try NativePolicy.integer(11, minimum: 0, maximum: 10))
        let id = UUID().uuidString.lowercased()
        var wire: [String: Any] = ["call": id, "document": UUID().uuidString.lowercased(), "operation": "hello", "request": [:]]
        let valid = String(data: try JSONSerialization.data(withJSONObject: wire), encoding: .utf8)!
        XCTAssertEqual(try NativePolicy.Message(valid).call, id)
        wire["document"] = "stale-or-invalid"
        let invalid = String(data: try JSONSerialization.data(withJSONObject: wire), encoding: .utf8)!
        XCTAssertThrowsError(try NativePolicy.Message(invalid))
    }

    private func response(status: Int = 200, headers: [String: String] = [:]) throws -> NativeResponse {
        let url = try XCTUnwrap(URL(string: "https://0xdmme.app/api/account/messages/page"))
        let http = try XCTUnwrap(HTTPURLResponse(url: url, statusCode: status, httpVersion: "HTTP/1.1", headerFields: headers))
        return try NativeResponse(http, request: NativePolicy.Request(request()))
    }

    func testHTTPFailuresRemainVisibleWithoutExposingCookiesOrFollowingRedirects() throws {
        let value = try response(status: 401, headers: [
            "content-type": "application/json", "content-length": "2",
            "set-cookie": "synthetic-private-value", "x-untrusted": "not-exposed"
        ])
        XCTAssertEqual(value.visible["status"] as? Int, 401)
        let headers = try XCTUnwrap(value.visible["headers"] as? [String: String])
        XCTAssertNil(headers["set-cookie"])
        XCTAssertNil(headers["x-untrusted"])
        XCTAssertEqual(value.cookies.count, 1)
        for status in [101, 301, 302, 307, 308, 600] {
            XCTAssertThrowsError(try response(status: status))
        }
        for fields in [["content-encoding": "gzip"], ["content-length": "-1"], ["content-length": "01"], ["content-length": String(NativePolicy.responseBytes + 1)]] {
            XCTAssertThrowsError(try response(headers: fields))
        }
    }

    private func exchange(length: Int) throws -> (NativeExchange, URLSession) {
        // This task is never resumed: every read below has buffered data or an
        // already completed body, and overflow cases perform no reads.
        let session = URLSession(configuration: .ephemeral)
        let url = try XCTUnwrap(URL(string: "https://native-contract.invalid/never-requested"))
        let value = NativeExchange(try NativePolicy.Request(request()), task: session.dataTask(with: url))
        try value.accept(response(headers: ["content-length": String(length)]))
        return (value, session)
    }

    func testBodyReadsPreserveExactBytesReachEOFAndRejectLengthOrBufferOverflow() throws {
        let bytes = Data("fixture".utf8)
        let (value, session) = try exchange(length: bytes.count)
        defer { value.close(); session.invalidateAndCancel() }
        try value.append(bytes)
        try value.complete(nil)
        var restored = Data()
        for _ in 0..<3 {
            var result: Result<Any, Error>?
            try value.read(3) { result = $0 }
            let raw = try XCTUnwrap(try XCTUnwrap(result).get() as? [String: Any])
            XCTAssertEqual(raw["done"] as? Bool, false)
            let encoded = try XCTUnwrap(raw["data"] as? String)
            restored.append(try XCTUnwrap(Data(base64Encoded: encoded)))
        }
        XCTAssertEqual(restored, bytes)
        var end: Result<Any, Error>?
        try value.read(3) { end = $0 }
        let eof = try XCTUnwrap(try XCTUnwrap(end).get() as? [String: Any])
        XCTAssertEqual(eof["done"] as? Bool, true)
        value.close()
        XCTAssertThrowsError(try value.read(3) { _ in })

        let (short, shortSession) = try exchange(length: 2)
        defer { short.close(); shortSession.invalidateAndCancel() }
        try short.append(Data([1]))
        XCTAssertThrowsError(try short.complete(nil))
        let (overflow, overflowSession) = try exchange(length: 300_000)
        defer { overflow.close(); overflowSession.invalidateAndCancel() }
        XCTAssertThrowsError(try overflow.append(Data(repeating: 1, count: 256 * 1024 + 1)))
    }
}
