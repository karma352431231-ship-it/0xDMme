import Foundation
import XCTest
import UIKit
import WebKit
@testable import App

/** Owns a weak handle to the installed synthetic host's view and bounded UI
 * operations. UIKit owns the view; the external runner owns the app process.
 */
@MainActor
final class NativeProductTestDriver {
    enum Failure: Error { case unavailable, evaluationTimeout }
    private weak var webView: WKWebView?

    private init(_ webView: WKWebView) { self.webView = webView }

    static func connect() async throws -> NativeProductTestDriver {
        let configuration = try NativeConnectionFactory.configuration()
        guard configuration.testAnchor != nil else {
            throw XCTSkip("Installed product tests require the explicit local synthetic package")
        }
        guard Bundle.main.bundleIdentifier == "app.zeroxdmme.development" else {
            XCTFail("The synthetic test must run inside its installed native host")
            throw Failure.unavailable
        }
        let deadline = Date().addingTimeInterval(30)
        while Date() < deadline {
            let view = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
                .flatMap(\.windows).compactMap { $0.rootViewController as? NativeBridgeViewController }.first?.webView
            if let view { return NativeProductTestDriver(view) }
            try await Task.sleep(nanoseconds: 200_000_000)
        }
        XCTFail("The installed native controller did not provide its view")
        throw Failure.unavailable
    }

    func evaluate(_ script: String) async throws -> Any {
        guard let webView else { throw Failure.unavailable }
        return try await withCheckedThrowingContinuation { continuation in
            // The callback and deadline both run on the main queue. Only one may
            // complete; clearing the timer also breaks its captured reference.
            var finished = false
            var timer: DispatchWorkItem?
            let finish: (Result<Any, Error>) -> Void = { result in
                guard !finished else { return }
                finished = true
                timer?.cancel()
                timer = nil
                continuation.resume(with: result)
            }
            let timeout = DispatchWorkItem { finish(.failure(Failure.evaluationTimeout)) }
            timer = timeout
            DispatchQueue.main.asyncAfter(deadline: .now() + 30, execute: timeout)
            webView.evaluateJavaScript(script) { value, error in
                if let error { finish(.failure(error)) }
                else { finish(.success(value ?? NSNull())) }
            }
        }
    }

    func string(_ script: String) async throws -> String {
        guard let value = try await evaluate(script) as? String else { throw Failure.unavailable }
        return value
    }

    func boolean(_ script: String) async throws -> Bool {
        guard let value = try await evaluate("Boolean(\(script))") as? Bool else { throw Failure.unavailable }
        return value
    }

    func click(_ selector: String) async throws {
        let quoted = String(data: try JSONSerialization.data(withJSONObject: selector, options: .fragmentsAllowed), encoding: .utf8)!
        try await wait("(() => {const n = document.querySelector(\(quoted)); return !!n && !n.hidden && !n.disabled && n.getClientRects().length > 0;})()", seconds: 30)
        let available = try await boolean("(() => {const n = document.querySelector(\(quoted)); if (!n || n.hidden || n.disabled || n.getClientRects().length === 0) return false; n.click(); return true;})()")
        XCTAssertTrue(available, "Public product action unavailable: \(selector)")
        if !available { throw Failure.unavailable }
    }

    func waitForProduct() async throws {
        let mounted = "!!document.querySelector('#app-shell')?.dataset.page && !!document.documentElement.dataset.testApp"
        let failed = "document.querySelector('body > [role=alert]')?.textContent.includes('The app connection could not start.')"
        try await wait("(\(mounted)) || (\(failed))", seconds: 120)
        if try await boolean(mounted) { return }
        try await failExpectedState()
    }

    func wait(_ condition: String, seconds: TimeInterval) async throws {
        let deadline = Date().addingTimeInterval(seconds)
        while Date() < deadline {
            if try await boolean(condition) { return }
            try await Task.sleep(nanoseconds: 250_000_000)
        }
        try await failExpectedState()
    }

    private func failExpectedState() async throws -> Never {
        let locations = try await string("JSON.stringify({errors:window.syntheticNativeDiagnostics?.errors ?? [],native:window.syntheticNativeDiagnostics?.native ?? []})")
        print("NATIVE_PRODUCT_FAILURE_LOCATIONS:" + locations)
        let visible = try await string("document.body.innerText.slice(0, 1800)")
        XCTFail("Installed product did not reach its expected public state: \(visible)")
        throw Failure.unavailable
    }

    /** The private fixture owns action cancellation and its 60-second budget.
     * This driver only invokes that fixture's public-DOM operation and result.
     */
    func action(_ name: String, input: String = "") async throws -> String {
        guard name.count <= 64, input.count <= 1024 else { throw Failure.unavailable }
        let arguments = try JSONSerialization.data(withJSONObject: [name, input])
        let encoded = String(data: arguments, encoding: .utf8)!
        _ = try await evaluate("window.syntheticNativeProduct.start(...\(encoded))")
        try await wait("window.syntheticNativeProduct.state.status !== 'running'", seconds: 70)
        let status = try await string("window.syntheticNativeProduct.state.status")
        let value = try await string("window.syntheticNativeProduct.state.value")
        XCTAssertEqual(status, "passed", "Synthetic public-DOM action failed: \(name): \(value.prefix(180))")
        guard status == "passed", value.count <= 1800 else { throw Failure.unavailable }
        print("NATIVE_PRODUCT_ACTION_PASSED:" + name)
        return value
    }

    func screenshot(named name: String) -> XCTAttachment? {
        guard let webView else { return nil }
        let proof = UIGraphicsImageRenderer(bounds: webView.bounds).image { _ in
            webView.drawHierarchy(in: webView.bounds, afterScreenUpdates: true)
        }
        guard let png = proof.pngData() else { return nil }
        let attachment = XCTAttachment(data: png, uniformTypeIdentifier: "public.png")
        attachment.name = name
        attachment.lifetime = .keepAlways
        return attachment
    }
}
