import XCTest

final class RuntimeFeasibilityTests: XCTestCase {
    private var preservePreparedFixture = false
    private enum FixtureFailure: Error {
        case unavailable
    }

    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    func testVerifiesPersistentSyntheticFixture() throws {
        let phase = ProcessInfo.processInfo.environment["NATIVE_FIXTURE_PHASE"] ?? "process"
        guard ["process", "prepare", "restore", "background", "expired", "corrupt"].contains(phase) else {
            XCTFail("Unknown native fixture phase")
            throw FixtureFailure.unavailable
        }
        print("0xDMme native fixture phase: \(phase)")
        let app = XCUIApplication()
        app.launch()
        addTeardownBlock {
            defer { app.terminate() }
            let clear = app.webViews.buttons["Clear test fixture"]
            if !self.preservePreparedFixture && app.state == .runningForeground && clear.exists && clear.isEnabled {
                clear.tap()
                try self.requireStatus("Synthetic fixture cleared. Product account data was not accessed.", in: app)
            }
        }
        try requireShell(in: app)
        if phase == "restore" {
            try verifyRestoredFixture(in: app)
            return
        }
        try createFixture(in: app)

        if phase == "prepare" {
            preservePreparedFixture = true
            return
        }

        if phase == "expired" || phase == "corrupt" {
            try verifyRejectedFixture(phase, in: app)
            return
        }

        if phase == "background" {
            XCUIDevice.shared.press(.home)
            XCTAssertTrue(app.wait(for: .runningBackground, timeout: 10) || app.wait(for: .runningBackgroundSuspended, timeout: 10))
            app.activate()
        } else {
            app.terminate()
            XCTAssertEqual(app.state, .notRunning)
            app.launch()
        }
        try requireShell(in: app)
        try verifyRestoredFixture(in: app)
    }

    private func createFixture(in app: XCUIApplication) throws {
        app.webViews.buttons["Clear test fixture"].tap()
        try requireStatus("Synthetic fixture cleared. Product account data was not accessed.", in: app)
        app.webViews.buttons["Run local checks"].tap()
        try requireStatus("Fixture created and verified. Restart the app, then run this check again. ", in: app)
    }

    private func verifyRejectedFixture(_ phase: String, in app: XCUIApplication) throws {
        if phase == "expired" {
            app.webViews.buttons["Expire test fixture"].tap()
            try requireStatus("Synthetic fixture marked expired. Run checks to verify rejection.", in: app)
        } else {
            app.webViews.buttons["Alter test ciphertext"].tap()
            try requireStatus("Synthetic ciphertext altered. Run checks to verify rejection.", in: app)
        }
        app.webViews.buttons["Run local checks"].tap()
        try requireStatus("Check failed or expired. No success was recorded.", in: app)
        try createFixture(in: app)
    }

    private func verifyRestoredFixture(in app: XCUIApplication) throws {
        app.webViews.buttons["Run local checks"].tap()
        // A newly generated key/fixture cannot satisfy this reopening assertion.
        try requireStatus("Stored fixture reopened and verified. ", in: app)
        let proof = XCTAttachment(screenshot: app.screenshot())
        proof.name = "Restored synthetic fixture after process restart"
        proof.lifetime = .keepAlways
        add(proof)
    }

    private func requireShell(in app: XCUIApplication) throws {
        let platform = app.webViews.staticTexts["Native bridge: ios."]
        // Cold simulator/WebKit startup can exceed the fixture operation deadline.
        guard platform.waitForExistence(timeout: 120),
              app.webViews.staticTexts["Installed-app feasibility"].exists,
              app.webViews.buttons["Run local checks"].exists,
              app.webViews.buttons["Clear test fixture"].exists else {
            XCTFail("The packaged native feasibility shell did not become ready")
            throw FixtureFailure.unavailable
        }
    }

    private func requireStatus(_ prefix: String, in app: XCUIApplication) throws {
        let matches = NSPredicate(format: "label BEGINSWITH %@", prefix)
        let report = app.webViews.staticTexts.matching(matches).firstMatch
        guard report.waitForExistence(timeout: 35) else {
            XCTFail("The native fixture did not report the expected outcome: " + prefix)
            throw FixtureFailure.unavailable
        }
        if prefix.hasPrefix("Fixture created") || prefix.hasPrefix("Stored fixture") {
            XCTAssertTrue(report.label.contains("Web Locks, nonextractable device keys and Matrix WASM encryption passed."))
            XCTAssertTrue(report.label.hasSuffix("Service identity: https://0xdmme.app"))
        }
    }
}
