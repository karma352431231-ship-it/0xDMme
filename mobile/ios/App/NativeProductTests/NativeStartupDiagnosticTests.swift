import Foundation
import XCTest
import Security
import UIKit
@testable import App

/** Explicit startup investigation owns its synthetic Keychain probe. It cannot
 * warm session owners during ordinary selected account acceptance.
 */
@MainActor
final class NativeStartupDiagnosticTests: XCTestCase {
    func testNativeStartupDiagnostic() async throws {
        guard ProcessInfo.processInfo.environment["NATIVE_STARTUP_DIAGNOSTIC"] == "1" else {
            throw XCTSkip("Startup diagnostics require an explicit synthetic run")
        }
        let driver = try await NativeProductTestDriver.connect()
        try await driver.wait("!!window.syntheticNativeDiagnostics && (!!document.querySelector('#app-shell')?.dataset.page || [...document.querySelectorAll('[role=alert]')].some(node=>node.textContent.includes('The app connection could not start.')))", seconds: 120)
        let state = try await driver.string("JSON.stringify({secure:isSecureContext,handler:!!window.webkit?.messageHandlers?.zeroXSession,nonce:typeof window.__zeroXSessionDocument==='string',connectionAlert:document.body.textContent.includes('The app connection could not start.'),errors:window.syntheticNativeDiagnostics.errors,native:window.syntheticNativeDiagnostics.native})")
        print("NATIVE_STARTUP_PUBLIC_STATE:" + state)
        print("NATIVE_STARTUP_PROTECTED_DATA:\(UIApplication.shared.isProtectedDataAvailable)")
        _ = try NativeConnectionFactory.configuration()
        print("NATIVE_STARTUP_CONFIGURATION:available")
        // Security calls can block. Keep diagnostic work off UIKit's actor;
        // both workers are awaited and remain owned by this test process.
        let status = await Task.detached(priority: .userInitiated) { Self.syntheticKeychainStatus() }.value
        print("NATIVE_STARTUP_SYNTHETIC_KEYCHAIN_STATUS:\(status.added),\(status.removed)")
        XCTAssertEqual(status.added, errSecSuccess)
        XCTAssertTrue(status.removed == errSecSuccess || status.removed == errSecItemNotFound)
        let cookieAvailable = await Task.detached(priority: .userInitiated) {
            do { _ = try NativeCookieRegistry.open(); return true }
            catch { return false }
        }.value
        print("NATIVE_STARTUP_COOKIE_OWNER:\(cookieAvailable ? "available" : "unavailable")")
        XCTAssertTrue(cookieAvailable, "The native cookie owner could not initialize")
        _ = try await driver.evaluate("window.syntheticNativeDiagnostics.handshakeProbe='pending';void window.webkit.messageHandlers.zeroXSession.postMessage(JSON.stringify({call:crypto.randomUUID(),document:window.__zeroXSessionDocument,operation:'hello',request:{}})).then(value=>{try{const reply=JSON.parse(value);window.syntheticNativeDiagnostics.handshakeProbe=reply.value===true?'ready':reply.value===false?'initializing':'denied';}catch{window.syntheticNativeDiagnostics.handshakeProbe='malformed';}},()=>{window.syntheticNativeDiagnostics.handshakeProbe='rejected';})")
        try await driver.wait("window.syntheticNativeDiagnostics.handshakeProbe !== 'pending'", seconds: 15)
        let handshake = try await driver.string("window.syntheticNativeDiagnostics.handshakeProbe")
        print("NATIVE_STARTUP_HANDSHAKE:" + handshake)
        XCTAssertEqual(handshake, "ready")
    }

    nonisolated private static func syntheticKeychainStatus() -> (added: OSStatus, removed: OSStatus) {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: "app.zeroxdmme.native.startup-test." + UUID().uuidString,
            kSecAttrAccount as String: "synthetic-probe",
            kSecAttrSynchronizable as String: false
        ]
        var add = query
        add[kSecValueData as String] = Data("synthetic-startup-probe".utf8)
        add[kSecAttrAccessible as String] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly
        let added = SecItemAdd(add as CFDictionary, nil)
        let removed = SecItemDelete(query as CFDictionary)
        return (added, removed)
    }
}
