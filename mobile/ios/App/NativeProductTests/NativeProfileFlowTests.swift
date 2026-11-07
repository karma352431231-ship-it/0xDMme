import Foundation
import XCTest

/** Saves and checks the same synthetic account's private profile and theme.
 * The external runner owns the process boundary between prepare and restore.
 */
@MainActor
final class NativeProfileFlowTests: XCTestCase {
    func testPrivateProfileAndTheme() async throws {
        let phase = ProcessInfo.processInfo.environment["NATIVE_PROFILE_PHASE"] ?? ""
        let name = ProcessInfo.processInfo.environment["NATIVE_PROFILE_NAME"] ?? ""
        guard ["prepare", "restore"].contains(phase), name.hasPrefix("Synthetic iPhone "), name.count <= 80 else {
            throw XCTSkip("Profile acceptance requires an explicit synthetic phase and name")
        }
        let expectedAddress = ProcessInfo.processInfo.environment["NATIVE_PRODUCT_ADDRESS"] ?? ""
        guard expectedAddress.range(of: "^0x[a-f0-9]{40}$", options: .regularExpression) != nil else {
            throw XCTSkip("Profile acceptance requires its explicit synthetic EVM address")
        }
        let driver = try await NativeProductTestDriver.connect()
        print("0xDMme installed iPhone profile process: \(ProcessInfo.processInfo.processIdentifier)")
        try await driver.waitForProduct()
        try await driver.wait("document.querySelector('#app-shell')?.dataset.account === 'connected' && !!window.syntheticNativeProduct", seconds: 30)
        _ = try await driver.evaluate("location.hash = 'perfil'")
        try await driver.wait("document.querySelector('#app-shell')?.dataset.page === 'perfil' && document.querySelector('[data-account-address]')?.title.toLowerCase() === 'wallet evm: \(expectedAddress)'", seconds: 30)
        if phase == "prepare" {
            _ = try await driver.action("profile-save", input: name)
            _ = try await driver.action("theme-save")
        } else {
            _ = try await driver.action("profile-check", input: name)
            _ = try await driver.action("theme-check")
        }
        let cookies = try await driver.string("document.cookie")
        XCTAssertEqual(cookies, "")
        if let image = driver.screenshot(named: "Installed iPhone profile — \(phase)") { add(image) }
        print("0xDMme installed iPhone profile phase passed: \(phase)")
    }
}
