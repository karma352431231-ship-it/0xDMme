import Foundation
import XCTest

/** Private physical UI executor. Only our explicit synthetic app is launched;
 * gestures and lifecycle transitions use public XCTest APIs. No personal apps,
 * screen dumps, credential prompts or protected product stores are inspected.
 */
final class NativeDirectProductUITests: XCTestCase {
    private var app: XCUIApplication!
    private var run = ""
    private var phase = ""

    override func setUpWithError() throws {
        continueAfterFailure = false
        let environment = ProcessInfo.processInfo.environment
        let bundle = environment["NATIVE_TEST_BUNDLE"] ?? ""
        guard ["app.zeroxdmme.development", "app.zeroxdmme.development.peer"].contains(bundle),
              let id = environment["NATIVE_UI_RUN_ID"], UUID(uuidString: id)?.uuidString.lowercased() == id,
              let selected = environment["NATIVE_UI_PHASE"], ["background", "action"].contains(selected) else {
            throw NSError(domain: "NativeFixtureConfiguration", code: 1)
        }
        run = id; phase = selected
        app = XCUIApplication(bundleIdentifier: bundle)
        app.launchEnvironment = environment.filter { $0.key.hasPrefix("NATIVE_UI_") }
        addTeardownBlock { self.app.terminate(); XCTAssertEqual(self.app.state, .notRunning) }
        app.launch()
        XCTAssertTrue(app.wait(for: .runningForeground, timeout: 30))
    }

    func testBackgroundContinuity() throws {
        guard phase == "background" else { throw NSError(domain: "NativeFixtureConfiguration", code: 2) }
        let view = app.staticTexts["0xDMmeSyntheticReport"]
        let ready = NSPredicate(format: "value == %@", "NATIVE_READY:background")
        XCTAssertTrue(view.waitForExistence(timeout: 60))
        expectation(for: ready, evaluatedWith: view)
        waitForExpectations(timeout: 100)
        XCUIDevice.shared.press(.home)
        XCTAssertTrue(app.wait(for: .runningBackground, timeout: 10) || app.wait(for: .runningBackgroundSuspended, timeout: 10))
        app.activate()
        XCTAssertTrue(app.wait(for: .runningForeground, timeout: 15))
        try requireNativeResult(expectedChecks: 18)
    }

    func testRealProductMediaGesture() throws {
        guard phase == "action" else { throw NSError(domain: "NativeFixtureConfiguration", code: 3) }
        let action = ProcessInfo.processInfo.environment["NATIVE_UI_ACTION"] ?? ""
        let label: String
        if action == "social-voice-send" { label = "Gravar áudio" }
        else if action == "social-voice-receive" { label = "Ouvir mensagem de voz" }
        else if action == "voice-record" { label = "Gravar mensagem de voz" }
        else { throw NSError(domain: "NativeFixtureConfiguration", code: 4) }
        let target = app.webViews.buttons[label].firstMatch
        XCTAssertTrue(target.waitForExistence(timeout: 90))
        expectation(for: NSPredicate(format: "hittable == true AND enabled == true"), evaluatedWith: target)
        waitForExpectations(timeout: 30)
        let monitor = addUIInterruptionMonitor(withDescription: "Synthetic test microphone consent only") { alert in
            Self.allowMicrophone(alert)
        }
        defer { removeUIInterruptionMonitor(monitor) }
        // The private-conversation recorder's public touch contract uses a
        // double tap for hands-free capture; a single tap only shows a hint.
        if action == "voice-record" { target.doubleTap() }
        else { target.tap() }
        let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        let deadline = Date().addingTimeInterval(12)
        while Date() < deadline {
            let alert = springboard.alerts.firstMatch
            if alert.exists && Self.allowMicrophone(alert) { break }
            Thread.sleep(forTimeInterval: 0.25)
        }
        try requireNativeResult(expectedChecks: 17)
    }

    func testRealProductCameraGesture() throws {
        guard phase == "action", ProcessInfo.processInfo.environment["NATIVE_UI_ACTION"] == "camera-native-lifecycle" else {
            throw NSError(domain: "NativeFixtureConfiguration", code: 5)
        }
        try cameraGesture()
    }

    func testRealProductOpticalGesture() throws {
        guard phase == "action", ProcessInfo.processInfo.environment["NATIVE_UI_ACTION"] == "camera-native-invitation" else {
            throw NSError(domain: "NativeFixtureConfiguration", code: 8)
        }
        try cameraGesture()
    }

    private func cameraGesture() throws {
        let target = app.webViews.buttons["Ler QR"].firstMatch
        XCTAssertTrue(target.waitForExistence(timeout: 90))
        expectation(for: NSPredicate(format: "hittable == true AND enabled == true"), evaluatedWith: target)
        waitForExpectations(timeout: 30)
        let monitor = addUIInterruptionMonitor(withDescription: "Synthetic app camera permission only") { alert in
            Self.allowCamera(alert)
        }
        defer { removeUIInterruptionMonitor(monitor) }
        target.tap()
        let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        let deadline = Date().addingTimeInterval(12)
        while Date() < deadline {
            for alert in [app.alerts.firstMatch, springboard.alerts.firstMatch] {
                if alert.exists { _ = Self.allowCamera(alert) }
            }
            Thread.sleep(forTimeInterval: 0.25)
        }
        try requireNativeResult(expectedChecks: 17)
    }

    private static func allowCamera(_ alert: XCUIElement) -> Bool {
        let text = alert.staticTexts.allElementsBoundByIndex.map(\.label).joined(separator: " ").lowercased()
        guard (text.contains("0xdmme") || text.contains("localhost")),
              text.contains("camera") || text.contains("câmera") else { return false }
        for title in ["Allow", "Permitir", "OK"] {
            let button = alert.buttons[title]
            if button.exists && button.isEnabled { button.tap(); return true }
        }
        return false
    }

    func testActualExportIntoOwnedSyntheticFolder() throws {
        guard phase == "action", ProcessInfo.processInfo.environment["NATIVE_UI_ACTION"] == "attachment-native-save" else {
            throw NSError(domain: "NativeFixtureConfiguration", code: 6)
        }
        let folder = app.descendants(matching: .any).matching(identifier: "0xDMme Synthetic Tests").firstMatch
        if !folder.waitForExistence(timeout: 5) {
            let ownLocation = app.buttons["0xDMme"].firstMatch
            XCTAssertTrue(ownLocation.waitForExistence(timeout: 15), "The picker did not offer the synthetic app's own location.")
            ownLocation.tap()
            XCTAssertTrue(folder.waitForExistence(timeout: 20), "The synthetic subfolder was not offered.")
            folder.tap()
        }
        XCTAssertTrue(folder.waitForExistence(timeout: 90), "The export picker did not open the fixture's own folder.")
        let save = firstExistingButton(["Save", "Salvar"], within: app.buttons)
        XCTAssertTrue(save.waitForExistence(timeout: 15))
        XCTAssertTrue(save.isEnabled)
        save.tap()
        expectation(for: NSPredicate(format: "exists == false"), evaluatedWith: folder)
        waitForExpectations(timeout: 20)
        try requireNativeResult(expectedChecks: 17)
    }

    func testOwnedFilePickerLayoutControl() throws {
        guard phase == "action", ProcessInfo.processInfo.environment["NATIVE_UI_ACTION"] == "attachment-native-save" else {
            throw NSError(domain: "NativeFixtureConfiguration", code: 9)
        }
        let save = app.buttons["Save"].firstMatch
        _ = save.waitForExistence(timeout: 30)
        let values: [String: Any] = [
            "ownedFolderNavigation": app.navigationBars["0xDMme Synthetic Tests"].exists,
            "ownedFolderText": app.staticTexts["0xDMme Synthetic Tests"].exists,
            "ownedFolderButton": app.buttons["0xDMme Synthetic Tests"].exists,
            "ownedFolderAny": app.descendants(matching: .any).matching(identifier: "0xDMme Synthetic Tests").firstMatch.exists,
            "ownedAppButton": app.buttons["0xDMme"].exists,
            "localLocationButton": app.buttons["On My iPhone"].exists || app.buttons["No Meu iPhone"].exists,
            "saveToFilesTitle": app.descendants(matching: .any).matching(identifier: "Save to Files").firstMatch.exists,
            "syntheticFileName": app.descendants(matching: .any).matching(identifier: "native-synthetic").firstMatch.exists || app.descendants(matching: .any).matching(identifier: "native-synthetic.txt").firstMatch.exists,
            "ownedAppText": app.staticTexts["0xDMme"].exists,
            "localLocation": app.staticTexts["On My iPhone"].exists || app.staticTexts["No Meu iPhone"].exists,
            "save": save.exists || app.buttons["Salvar"].exists,
            "cancel": app.buttons["Cancel"].exists || app.buttons["Cancelar"].exists,
            "browse": app.buttons["Browse"].exists || app.buttons["Explorar"].exists,
            "navigationCount": app.navigationBars.count
        ]
        let bytes = try JSONSerialization.data(withJSONObject: values, options: .sortedKeys)
        print("NATIVE_FILE_PICKER_LAYOUT:" + String(data: bytes, encoding: .utf8)!)
        let cancel = firstExistingButton(["Cancel", "Cancelar"], within: app.buttons)
        if cancel.exists { cancel.tap() }
        try requireNativeResult(expectedChecks: 17)
    }

    func testActualFilePickerSelectsOwnedSyntheticExport() throws {
        guard phase == "action", ProcessInfo.processInfo.environment["NATIVE_UI_ACTION"] == "attachment-pick-send" else {
            throw NSError(domain: "NativeFixtureConfiguration", code: 7)
        }
        let attach = app.webViews.buttons["Anexar foto ou arquivo"].firstMatch
        XCTAssertTrue(attach.waitForExistence(timeout: 90))
        expectation(for: NSPredicate(format: "hittable == true AND enabled == true"), evaluatedWith: attach)
        waitForExpectations(timeout: 30)
        attach.tap()
        let choose = firstExistingButton(["Choose File", "Choose Files", "Escolher Arquivo", "Escolher arquivos"], within: app.buttons)
        if choose.waitForExistence(timeout: 8) { choose.tap() }
        let folder = app.navigationBars["0xDMme Synthetic Tests"]
        if !folder.waitForExistence(timeout: 5) {
            try openOwnedSyntheticFolder()
        }
        let selectedFolder = app.descendants(matching: .any).matching(identifier: "0xDMme Synthetic Tests").firstMatch
        XCTAssertTrue(selectedFolder.waitForExistence(timeout: 15))
        let full = app.staticTexts["native-synthetic.txt"].firstMatch
        let base = app.staticTexts["native-synthetic"].firstMatch
        let file = full.exists ? full : base
        XCTAssertTrue(file.waitForExistence(timeout: 15))
        file.tap()
        try requireNativeResult(expectedChecks: 17)
    }

    private func openOwnedSyntheticFolder() throws {
        let browse = firstExistingButton(["Browse", "Explorar"], within: app.buttons)
        if browse.exists { browse.tap() }
        let local = app.staticTexts["On My iPhone"].firstMatch
        let localized = app.staticTexts["No Meu iPhone"].firstMatch
        let location = local.exists ? local : localized
        XCTAssertTrue(location.waitForExistence(timeout: 10))
        location.tap()
        let product = app.staticTexts["0xDMme"].firstMatch
        XCTAssertTrue(product.waitForExistence(timeout: 10))
        product.tap()
        let folder = app.staticTexts["0xDMme Synthetic Tests"].firstMatch
        XCTAssertTrue(folder.waitForExistence(timeout: 10))
        folder.tap()
    }

    private func firstExistingButton(_ titles: [String], within buttons: XCUIElementQuery) -> XCUIElement {
        for title in titles {
            let button = buttons[title].firstMatch
            if button.exists { return button }
        }
        return buttons[titles[0]].firstMatch
    }

    private static func allowMicrophone(_ alert: XCUIElement) -> Bool {
        let text = alert.staticTexts.allElementsBoundByIndex.map(\.label).joined(separator: " ").lowercased()
        guard text.contains("0xdmme"), text.contains("microphone") || text.contains("microfone") else { return false }
        for title in ["Allow", "Permitir", "OK"] {
            let allow = alert.buttons[title]
            if allow.exists && allow.isEnabled { allow.tap(); return true }
        }
        return false
    }

    private func requireNativeResult(expectedChecks: Int) throws {
        let view = app.staticTexts["0xDMmeSyntheticReport"]
        expectation(for: NSPredicate(format: "value BEGINSWITH %@", "NATIVE_RESULT:"), evaluatedWith: view)
        waitForExpectations(timeout: 110)
        let text = try XCTUnwrap(view.value as? String)
        guard text.hasPrefix("NATIVE_RESULT:"), text.utf8.count <= 4096,
              let bytes = String(text.dropFirst("NATIVE_RESULT:".count)).data(using: .utf8),
              let result = try JSONSerialization.jsonObject(with: bytes) as? [String: Any],
              result["run"] as? String == run, result["phase"] as? String == phase,
              let checks = result["checks"] as? [String: Bool] else {
            throw NSError(domain: "NativeFixtureResult", code: 1)
        }
        XCTAssertTrue(result["passed"] as? Bool == true)
        XCTAssertEqual(result["failureCode"] as? String, "")
        XCTAssertEqual(checks.count, expectedChecks)
        XCTAssertTrue(checks.values.allSatisfy { $0 })
        XCTAssertEqual(app.state, .runningForeground)
        print("NATIVE_PHYSICAL_UI_RESULT:" + String(text.dropFirst("NATIVE_RESULT:".count)))
    }
}
