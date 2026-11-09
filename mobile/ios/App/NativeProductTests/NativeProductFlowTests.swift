import Foundation
import XCTest

/** App-hosted account acceptance uses the installed native view and real
 * challenge/signature flow. Wallet providers exist only in the private fixture.
 */
@MainActor
final class NativeProductFlowTests: XCTestCase {
    func testSyntheticProductAccount() async throws {
        let phase = ProcessInfo.processInfo.environment["NATIVE_PRODUCT_PHASE"] ?? "login"
        guard ["login", "restore"].contains(phase) else {
            XCTFail("Unknown installed account phase")
            return
        }
        let expectedAddress = ProcessInfo.processInfo.environment["NATIVE_PRODUCT_ADDRESS"] ?? ""
        guard expectedAddress.range(of: "^0x[a-f0-9]{40}$", options: .regularExpression) != nil else {
            throw XCTSkip("Account acceptance requires its explicit synthetic EVM address")
        }
        let driver = try await NativeProductTestDriver.connect()
        print("0xDMme installed iPhone product process: \(ProcessInfo.processInfo.processIdentifier)")
        // Static packaged HTML precedes the router. Wait for its mounted route
        // before navigation, and for visible/enabled controls before each click.
        try await driver.waitForProduct()
        let origin = try await driver.string("location.origin")
        XCTAssertEqual(origin, "capacitor://localhost")
        let installed = try await driver.boolean("isSecureContext && innerWidth <= 500 && !!window.webkit.messageHandlers.zeroXSession")
        XCTAssertTrue(installed)
        let privateCookies = try await driver.string("document.cookie")
        XCTAssertEqual(privateCookies, "")
        _ = try await driver.evaluate("location.hash = 'perfil'")
        try await driver.wait("document.querySelector('#app-shell')?.dataset.page === 'perfil' && !!document.querySelector('[data-account-status]')", seconds: 30)
        if phase == "login" {
            try await driver.wait("document.querySelector('[data-account-status]').textContent !== 'Verificando sessão…'", seconds: 30)
            if try await driver.boolean("document.querySelector('#app-shell').dataset.account === 'connected'") {
                try await driver.click("[data-logout]")
                try await driver.wait("document.querySelector('#app-shell').dataset.account === 'guest'", seconds: 30)
            }
            try await driver.click("[data-wallet-picker-toggle]")
            try await driver.click("[data-wallet-brand=MetaMask]")
            try await driver.click("[data-wallet=MetaMask]")
        }
        try await driver.wait("document.querySelector('#app-shell').dataset.account === 'connected'", seconds: 90)
        try await driver.wait("document.querySelector('[data-private-profile]')?.hidden === false", seconds: 90)
        try await driver.wait("document.querySelector('[data-account-address]')?.title.toLowerCase() === 'wallet evm: \(expectedAddress)'", seconds: 30)
        let afterCookies = try await driver.string("document.cookie")
        XCTAssertEqual(afterCookies, "")
        if let attachment = driver.screenshot(named: "Installed iPhone product — \(phase)") { add(attachment) }
        print("0xDMme installed iPhone product phase passed: \(phase)")
    }
}
