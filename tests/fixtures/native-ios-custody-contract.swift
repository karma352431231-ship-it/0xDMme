#if DEBUG && MOBILE_SYNTHETIC_TEST
import Foundation
import Security
import XCTest
@testable import App

/** Physical Keychain contracts in an explicit private control host. The builder
 * substitutes only the service/install-marker names in an exact source copy;
 * normal account sessions and their markers are never queried or modified.
 */
final class NativeCustodyContractTests: XCTestCase {
    private let service = "app.zeroxdmme.native.synthetic-custody-contract.v1"
    private let markerName = "0xdmme-synthetic-custody-contract-v1"
    private var query: [String: Any] {
        [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service,
         kSecAttrAccount as String: "private-cookies", kSecAttrSynchronizable as String: false]
    }

    override func setUpWithError() throws {
        continueAfterFailure = false
        guard Bundle.main.bundleIdentifier == "app.zeroxdmme.development.recovery",
              let file = Bundle.main.url(forResource: "native-custody-contract", withExtension: "json"),
              let value = try JSONSerialization.jsonObject(with: Data(contentsOf: file)) as? [String: String],
              value == ["kind": "synthetic-custody-contract-v1", "service": service, "marker": markerName] else {
            throw NSError(domain: "NativeCustodyFixture", code: 1)
        }
        try clearSynthetic()
        addTeardownBlock { try self.clearSynthetic() }
    }

    private func marker() throws -> URL {
        try FileManager.default.url(for: .libraryDirectory, in: .userDomainMask, appropriateFor: nil, create: true).appendingPathComponent(markerName)
    }

    private func clearSynthetic() throws {
        let removed = SecItemDelete(query as CFDictionary)
        guard removed == errSecSuccess || removed == errSecItemNotFound else { throw NSError(domain: NSOSStatusErrorDomain, code: Int(removed)) }
        let file = try marker()
        if FileManager.default.fileExists(atPath: file.path) { try FileManager.default.removeItem(at: file) }
    }

    private func cookie(_ name: String, _ character: String, _ age: Int) -> String {
        let value = age == 0 ? "" : String(repeating: character, count: 64)
        return "__Host-hash-talk-\(name)=\(value); Path=/; HttpOnly; SameSite=Strict; Max-Age=\(age); Secure"
    }

    func testLateResponsesCannotRestoreSupersededChallengeOrLoggedOutSession() throws {
        let owner = try NativeCookies()
        let first = try owner.reserve("/api/account/challenge")
        let second = try owner.reserve("/api/account/challenge")
        XCTAssertThrowsError(try owner.apply(first, [cookie("challenge", "a", 300)]))
        try owner.apply(second, [cookie("challenge", "b", 300)])
        XCTAssertEqual(try NativeCookies().header(), "__Host-hash-talk-challenge=" + String(repeating: "b", count: 64))
        let login = try owner.reserve("/api/account/login")
        let logout = try owner.reserve("/api/account/logout")
        XCTAssertThrowsError(try owner.apply(login, [cookie("session", "c", 300), cookie("challenge", "", 0)]))
        try owner.apply(logout, [cookie("session", "", 0)])
        XCTAssertFalse(try NativeCookies().header().contains("session="))
        XCTAssertFalse(try owner.header().contains("session="))
    }

    func testCookieScopeAttributesLifetimeAndDuplicatesFailClosed() throws {
        let owner = try NativeCookies()
        let anonymous = try owner.reserve("/api/public-media/synthetic")
        XCTAssertThrowsError(try owner.apply(anonymous, [cookie("session", "a", 300)]))
        let challenge = try owner.reserve("/api/account/challenge")
        for invalid in [
            cookie("challenge", "a", 301), cookie("challenge", "a", 300) + "; Domain=0xdmme.app",
            cookie("challenge", "a", 300).replacingOccurrences(of: "Secure", with: "Unknown"),
            cookie("challenge", "a", 300).replacingOccurrences(of: "Strict", with: "None"),
            cookie("challenge", "a", 300).replacingOccurrences(of: "Path=/", with: "Path=/api"),
            cookie("other", "a", 300)
        ] {
            XCTAssertThrowsError(try owner.apply(challenge, [invalid]))
        }
        XCTAssertThrowsError(try owner.apply(challenge, [cookie("challenge", "a", 300), cookie("challenge", "b", 300)]))
        XCTAssertEqual(try owner.header(), "")
        try owner.apply(challenge, [cookie("challenge", "c", 300)])
        XCTAssertEqual(try owner.header(), "__Host-hash-talk-challenge=" + String(repeating: "c", count: 64))
    }

    func testActualKeychainIsUnlockedDeviceOnlyAndInstallMarkerIsProtected() throws {
        let owner = try NativeCookies()
        try owner.apply(owner.reserve("/api/account/login"), [cookie("session", "a", 300)])
        var attributes = query
        attributes[kSecReturnAttributes as String] = true
        attributes[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        XCTAssertEqual(SecItemCopyMatching(attributes as CFDictionary, &result), errSecSuccess)
        let row = try XCTUnwrap(result as? [String: Any])
        XCTAssertEqual(row[kSecAttrAccessible as String] as? String, kSecAttrAccessibleWhenUnlockedThisDeviceOnly as String)
        XCTAssertNotEqual(row[kSecAttrSynchronizable as String] as? Bool, true)
        let file = try marker()
        XCTAssertTrue(try file.resourceValues(forKeys: [.isExcludedFromBackupKey]).isExcludedFromBackup == true)
        let protection = try FileManager.default.attributesOfItem(atPath: file.path)[.protectionKey] as? FileProtectionType
        XCTAssertEqual(protection, .complete)
        XCTAssertEqual(try NativeCookies().header(), "__Host-hash-talk-session=" + String(repeating: "a", count: 64))
    }

    func testMalformedMissingAndExpiredRecordsNeverBecomeValidSessions() throws {
        _ = try NativeCookies()
        for bytes in [Data("not-json".utf8), Data("{\"version\":2,\"cookies\":[]}".utf8), Data("{\"version\":1,\"cookies\":[{\"name\":\"other\",\"value\":\"a\",\"expires\":1}]}".utf8)] {
            try NativeCookieStore().save(bytes)
            XCTAssertThrowsError(try NativeCookies())
        }
        let expired = try JSONSerialization.data(withJSONObject: ["version": 1, "cookies": [["name": "__Host-hash-talk-session", "value": String(repeating: "a", count: 64), "expires": 1]]])
        try NativeCookieStore().save(expired)
        XCTAssertEqual(try NativeCookies().header(), "")
        XCTAssertEqual(SecItemDelete(query as CFDictionary), errSecSuccess)
        XCTAssertThrowsError(try NativeCookies())
    }

    func testFreshInstallMarkerRejectsOrphanedKeychainAndInvalidMarkerFailsClosed() throws {
        let owner = try NativeCookies()
        try owner.apply(owner.reserve("/api/account/login"), [cookie("session", "a", 300)])
        try FileManager.default.removeItem(at: marker())
        XCTAssertEqual(try NativeCookies().header(), "")
        try Data("invalid synthetic marker".utf8).write(to: marker(), options: [.atomic, .completeFileProtection])
        XCTAssertThrowsError(try NativeCookies())
    }

    func testRealHTTPSUnauthorizedResponseAndEOFRemainVisible() async throws {
        let owner = NativeSession(try NativeConnectionFactory.configuration())
        defer { owner.close() }
        let end = Date().addingTimeInterval(20)
        var ready = false
        while Date() < end && !ready {
            ready = try await reply { owner.ready($0) } as? Bool == true
            if !ready { try await Task.sleep(nanoseconds: 100_000_000) }
        }
        XCTAssertTrue(ready)
        let id = UUID().uuidString.lowercased()
        let request: [String: Any] = ["id": id, "path": "/api/account/session", "method": "GET", "credentials": "omit", "headers": [:]]
        let opened = try await reply { owner.open(request, reply: $0) }
        let response = try XCTUnwrap(opened as? [String: Any])
        XCTAssertEqual(response["status"] as? Int, 401)
        let headers = try XCTUnwrap(response["headers"] as? [String: String])
        XCTAssertNil(headers["set-cookie"])
        var bytes = 0
        var ended = false
        for _ in 0..<8 {
            let received = try await reply { owner.read(["id": id, "bytes": 4096], reply: $0) }
            let value = try XCTUnwrap(received as? [String: Any])
            let text = try XCTUnwrap(value["data"] as? String)
            bytes += try XCTUnwrap(Data(base64Encoded: text)).count
            if value["done"] as? Bool == true { ended = true; break }
        }
        XCTAssertTrue(ended)
        XCTAssertGreaterThan(bytes, 0)
        XCTAssertLessThanOrEqual(bytes, 4096)
    }

    private func reply(_ operation: (@escaping NativeSession.Reply) -> Void) async throws -> Any {
        try await withCheckedThrowingContinuation { continuation in
            operation { result in continuation.resume(with: result) }
        }
    }
}
#endif
