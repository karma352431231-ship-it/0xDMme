#if DEBUG && MOBILE_SYNTHETIC_TEST
import Foundation
import XCTest
@testable import App

/** Exercises the unchanged offline probe through its public UI in a real
 * installed WKWebView. Only the probe's separate synthetic database is cleared;
 * no product account/history database or API is read by this driver.
 */
@MainActor
final class NativeStorageLifecycleContractTests: XCTestCase {
    func testSyntheticStorageLifecycle() async throws {
        let phase = ProcessInfo.processInfo.environment["NATIVE_STORAGE_PHASE"] ?? ""
        guard ["prepare", "restore", "expired", "corrupt", "clear"].contains(phase),
              Bundle.main.bundleIdentifier == "app.zeroxdmme.development.recovery" else {
            throw NSError(domain: "NativeStorageFixture", code: 1)
        }
        let driver = try await NativeProductTestDriver.connect()
        try await driver.wait("document.querySelector('#platform')?.textContent === 'Native bridge: ios.' && !!document.querySelector('main[data-build=\"native-feasibility-v1\"]')", seconds: 60)
        let installed = try await driver.boolean("isSecureContext && location.origin === 'capacitor://localhost' && innerWidth <= 500 && document.cookie === ''")
        XCTAssertTrue(installed)
        if phase == "clear" {
            try await clear(driver)
        } else if phase == "prepare" {
            try await clear(driver)
            try await check(driver, restored: false)
        } else {
            try await check(driver, restored: true)
            if phase != "restore" {
                try await rejectAltered(driver, phase: phase)
                try await clear(driver)
                try await check(driver, restored: false)
            }
        }
        let result: [String: Any] = ["schema": 1, "phase": phase, "passed": true, "processId": ProcessInfo.processInfo.processIdentifier]
        let bytes = try JSONSerialization.data(withJSONObject: result, options: .sortedKeys)
        print("NATIVE_PHYSICAL_STORAGE_RESULT:" + String(decoding: bytes, as: UTF8.self))
    }

    private func clear(_ driver: NativeProductTestDriver) async throws {
        try await driver.click("#clear")
        try await driver.wait("document.querySelector('#result')?.textContent === 'Synthetic fixture cleared. Product account data was not accessed.' && !document.querySelector('#run').disabled", seconds: 35)
    }

    private func check(_ driver: NativeProductTestDriver, restored: Bool) async throws {
        try await driver.click("#run")
        let prefix = restored ? "Stored fixture reopened and verified. " : "Fixture created and verified. Restart the app, then run this check again. "
        let expected = prefix + "Web Locks, nonextractable device keys and Matrix WASM encryption passed. Service identity: https://0xdmme.app"
        let quoted = String(decoding: try JSONSerialization.data(withJSONObject: expected, options: .fragmentsAllowed), as: UTF8.self)
        try await driver.wait("document.querySelector('#result')?.textContent === \(quoted) && !document.querySelector('#run').disabled", seconds: 35)
    }

    private func rejectAltered(_ driver: NativeProductTestDriver, phase: String) async throws {
        try await driver.click(phase == "expired" ? "#expire" : "#corrupt")
        let text = phase == "expired"
            ? "Synthetic fixture marked expired. Run checks to verify rejection."
            : "Synthetic ciphertext altered. Run checks to verify rejection."
        let quoted = String(decoding: try JSONSerialization.data(withJSONObject: text, options: .fragmentsAllowed), as: UTF8.self)
        try await driver.wait("document.querySelector('#result')?.textContent === \(quoted) && !document.querySelector('#run').disabled", seconds: 35)
        try await driver.click("#run")
        try await driver.wait("document.querySelector('#result')?.textContent === 'Check failed or expired. No success was recorded. Clear the synthetic fixture to start again.' && !document.querySelector('#run').disabled", seconds: 35)
    }
}
#endif
