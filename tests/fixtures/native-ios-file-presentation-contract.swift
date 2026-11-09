#if DEBUG && MOBILE_SYNTHETIC_TEST
import Foundation
import UIKit
import XCTest
@testable import App

/** Actual product export presentation. Cancels our own picker without browsing
 * the owner's files or writing decrypted attachment bytes outside the app.
 */
@MainActor
final class NativeFilePresentationContractTests: XCTestCase {
    func testVerifiedOriginalAttachmentOffersNativeExport() async throws {
        let input = ProcessInfo.processInfo.environment["NATIVE_FILE_INPUT"] ?? ""
        guard Bundle.main.bundleIdentifier == "app.zeroxdmme.development",
              input.utf8.count > 0, input.utf8.count <= 1024 else {
            throw NSError(domain: "NativeFileFixture", code: 1)
        }
        let driver = try await NativeProductTestDriver.connect()
        let mounted = "!!document.querySelector('#app-shell')?.dataset.page && !!window.syntheticNativeProduct"
        try await wait(driver, mounted)
        let arguments = String(data: try JSONSerialization.data(withJSONObject: ["attachment-native-save", input]), encoding: .utf8)!
        _ = try await driver.evaluate("window.syntheticNativeProduct.start(...\(arguments))")
        try await wait(driver, "window.syntheticNativeProduct.state.status !== 'running'")
        let passed = try await driver.boolean("window.syntheticNativeProduct.state.status === 'passed'")
        XCTAssertTrue(passed, "The public original-file verification did not complete.")
        let controller = try XCTUnwrap(UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
            .flatMap(\.windows).compactMap { $0.rootViewController as? NativeBridgeViewController }.first)
        defer { controller.dismiss(animated: false) }
        let deadline = Date().addingTimeInterval(10)
        var picker: UIDocumentPickerViewController?
        while Date() < deadline {
            picker = controller.presentedViewController as? UIDocumentPickerViewController
            if picker != nil { break }
            try await Task.sleep(nanoseconds: 200_000_000)
        }
        XCTAssertNotNil(picker, "The verified Blob save action did not present a native file exporter.")
        if let picker {
            let caches = try FileManager.default.url(for: .cachesDirectory, in: .userDomainMask, appropriateFor: nil, create: false)
            let root = caches.appendingPathComponent("0xdmme-file-exports", isDirectory: true)
            let stages = try FileManager.default.contentsOfDirectory(at: root, includingPropertiesForKeys: nil)
            XCTAssertEqual(stages.count, 1)
            let stage = try XCTUnwrap(stages.first)
            let file = stage.appendingPathComponent("native-synthetic.txt")
            let fields = try XCTUnwrap(try JSONSerialization.jsonObject(with: Data(input.utf8)) as? [String: String])
            let marker = try XCTUnwrap(fields["text"])
            let expected = Data(String(repeating: "0xDMme synthetic attachment: " + marker + "\n", count: 1024).utf8)
            XCTAssertEqual(try Data(contentsOf: file), expected)
            XCTAssertTrue(try file.resourceValues(forKeys: [.isExcludedFromBackupKey]).isExcludedFromBackup == true)
            let protection = try FileManager.default.attributesOfItem(atPath: file.path)[.protectionKey] as? FileProtectionType
            XCTAssertEqual(protection, .complete)
            picker.delegate?.documentPickerWasCancelled?(picker)
            controller.dismiss(animated: false)
            XCTAssertFalse(FileManager.default.fileExists(atPath: stage.path))
        }
        let retained = try await driver.boolean("location.origin === 'capacitor://localhost' && !!document.querySelector('#app-shell')?.dataset.page")
        XCTAssertTrue(retained)
        print("NATIVE_FILE_PRESENTATION_CONTROL:sourceVerified=\(passed),nativeExporter=\(picker != nil),externalFileWrite=false")
    }

    private func wait(_ driver: NativeProductTestDriver, _ condition: String) async throws {
        let deadline = Date().addingTimeInterval(80)
        while Date() < deadline {
            if try await driver.boolean(condition) { return }
            try await Task.sleep(nanoseconds: 250_000_000)
        }
        throw NSError(domain: "NativeFileFixtureDeadline", code: 1)
    }
}
#endif
