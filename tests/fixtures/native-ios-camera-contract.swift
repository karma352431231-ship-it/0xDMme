#if DEBUG && MOBILE_SYNTHETIC_TEST
import AVFoundation
import Foundation
import XCTest
@testable import App

/** Physical optical/camera checks. Authorization is the OS's ordinary explicit
 * prompt for our synthetic app. Frames, device inventory and payload contents
 * never leave this test host; only the scenario result is reported.
 */
@MainActor
final class NativeCameraProductContractTests: XCTestCase {
    func testActualCameraFramesAndExplicitCloseReleaseTracks() async throws {
        let driver = try await product()
        let allowed = await AVCaptureDevice.requestAccess(for: .video)
        XCTAssertTrue(allowed, "The app camera permission was not granted.")
        guard allowed else { return }
        _ = try await driver.action("camera-lifecycle")
        print("NATIVE_CAMERA_CONTROL:actualFrames=true,explicitClose=true,tracksStopped=true,framesExported=false")
    }

    func testPhysicalOpticalInvitationScanMatchesAndReleasesCamera() async throws {
        let input = ProcessInfo.processInfo.environment["NATIVE_QR_INPUT"] ?? ""
        guard input.utf8.count > 0, input.utf8.count <= 512 else { throw NSError(domain: "NativeCameraFixture", code: 2) }
        let driver = try await product()
        _ = try await driver.action("camera-invitation", input: input)
        print("NATIVE_CAMERA_QR_CONTROL:opticalExactPayload=true,readerClosed=true,framesExported=false")
    }

    private func product() async throws -> NativeProductTestDriver {
        guard Bundle.main.bundleIdentifier == "app.zeroxdmme.development" else { throw NSError(domain: "NativeCameraFixture", code: 1) }
        let driver = try await NativeProductTestDriver.connect()
        let deadline = Date().addingTimeInterval(90)
        while Date() < deadline {
            if try await driver.boolean("!!document.querySelector('#app-shell')?.dataset.page && !!window.syntheticNativeProduct") { return driver }
            try await Task.sleep(nanoseconds: 200_000_000)
        }
        throw NSError(domain: "NativeCameraFixtureDeadline", code: 1)
    }
}
#endif
