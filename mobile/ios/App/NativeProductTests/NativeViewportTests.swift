import UIKit
import WebKit
import XCTest
@testable import App

@MainActor
final class NativeViewportTests: XCTestCase {
    func testViewportTracksSystemInsetsAndSizeWithoutScrollInsetDuplication() {
        let webView = WKWebView(frame: .zero)
        let controller = UIViewController()
        controller.view = NativeViewportView(webView)
        let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 393, height: 852))
        window.rootViewController = controller
        window.makeKeyAndVisible()
        defer { window.isHidden = true }
        for size in [CGSize(width: 393, height: 852), CGSize(width: 852, height: 393)] {
            window.frame.size = size
            controller.additionalSafeAreaInsets = UIEdgeInsets(top: 54, left: 12, bottom: 34, right: 12)
            window.setNeedsLayout()
            window.layoutIfNeeded()
            controller.view.layoutIfNeeded()
            let safe = controller.view.safeAreaLayoutGuide.layoutFrame
            XCTAssertGreaterThan(safe.minY, 0)
            XCTAssertLessThan(safe.maxY, controller.view.bounds.maxY)
            XCTAssertEqual(webView.frame.minY, safe.minY)
            XCTAssertEqual(webView.frame.minX, safe.minX)
            XCTAssertEqual(webView.frame.width, safe.width)
            XCTAssertEqual(webView.frame.maxY, controller.view.bounds.maxY)
            XCTAssertEqual(webView.scrollView.contentInsetAdjustmentBehavior, .never)
        }
    }


    func testFullShellHandleAndPrivateConversationLayoutAcrossDockToggles() async throws {
        let fixture = try await fullShell()
        defer { fixture.window.isHidden = true; fixture.viewport.close() }
        for scope in ["handle", "private"] {
            if scope == "private" {
                _ = try await fixture.webView.evaluateJavaScript("document.getElementById('fixture-private').click()")
            }
            for _ in 0..<3 {
                try await assertConversation(fixture.webView, docked: false)
                _ = try await fixture.webView.evaluateJavaScript("document.querySelector('[data-public-emoji]').click()")
                try await assertConversation(fixture.webView, docked: true)
                _ = try await fixture.webView.evaluateJavaScript("document.querySelector('.emoji-composer-panel [data-close]').click(); document.querySelector('textarea').blur()")
                try await assertConversation(fixture.webView, docked: false)
            }
        }
        _ = try await fixture.webView.evaluateJavaScript("document.getElementById('fixture-leave').click()")
        let restored = try await fixture.webView.evaluateJavaScript("getComputedStyle(document.querySelector('.mobile-nav')).display !== 'none' && !document.querySelector('.emoji-composer-panel')")
        XCTAssertEqual(restored as? Bool, true)
        try await attach(fixture.webView, name: "Conversation closed - navigation restored")
    }


    func testIPhoneFormAccessoryBarIsAbsentForWebTextInput() async throws {
        let fixture = try await fullShell()
        defer { fixture.window.isHidden = true; fixture.viewport.close() }
        fixture.webView.becomeFirstResponder()
        _ = try await fixture.webView.evaluateJavaScript("document.querySelector('textarea').focus()")
        try await waitUntil("Web text input became first responder") {
            self.firstResponder(in: fixture.webView) != nil
        }
        let responder = try XCTUnwrap(firstResponder(in: fixture.webView))
        XCTAssertNil(responder.inputAccessoryView)
        let active = try await fixture.webView.evaluateJavaScript("document.activeElement?.tagName === 'TEXTAREA'")
        XCTAssertEqual(active as? Bool, true)
        _ = try await fixture.webView.evaluateJavaScript("document.querySelector('textarea').blur()")
    }

    func testReplyAndKeyboardDockKeepDocumentStationary() async throws {
        let fixture = try await fullShell()
        defer { fixture.window.isHidden = true; fixture.viewport.close() }
        fixture.webView.becomeFirstResponder()
        for operation in [
            "document.querySelector('textarea').focus({preventScroll:true})",
            "window.fixtureReply()",
            "document.querySelector('[data-public-emoji]').click()",
            "document.querySelector('.emoji-composer-panel [data-close]').click()"
        ] {
            _ = try await fixture.webView.evaluateJavaScript("window.__touchTrace=[]; window.__touchTracing=true; (function sample(){ if(!window.__touchTracing)return; window.__touchTrace.push({scrollY:scrollY, viewportTop:visualViewport.offsetTop, shellTop:document.getElementById('app-shell').getBoundingClientRect().top}); requestAnimationFrame(sample) })();")
            _ = try await fixture.webView.evaluateJavaScript(operation)
            var nativeOffset: CGFloat = 0
            for _ in 0..<45 {
                nativeOffset = max(nativeOffset, abs(fixture.webView.scrollView.contentOffset.y))
                try await Task.sleep(nanoseconds: 20_000_000)
            }
            let trace = try await fixture.webView.evaluateJavaScript("window.__touchTracing=false; JSON.stringify(window.__touchTrace)")
            let text = try XCTUnwrap(trace as? String)
            let rows = try XCTUnwrap(JSONSerialization.jsonObject(with: Data(text.utf8)) as? [[String: Double]])
            let largestScroll = rows.map { abs($0["scrollY"] ?? 0) }.max() ?? 0
            let largestTop = rows.map { abs($0["shellTop"] ?? 0) }.max() ?? 0
            let attachment = XCTAttachment(string: "operation=" + operation + " nativeOffset=" + String(describing: nativeOffset) + " trace=" + text)
            attachment.name = "Synthetic touch transition geometry"
            attachment.lifetime = .keepAlways
            add(attachment)
            XCTAssertLessThanOrEqual(largestScroll, 1, "The document panned during " + operation)
            XCTAssertLessThanOrEqual(largestTop, 1, "The chat header moved during " + operation)
            XCTAssertLessThanOrEqual(nativeOffset, 1, "The native root scrolled during " + operation)
        }
    }

    private func firstResponder(in view: UIView) -> UIView? {
        if view.isFirstResponder { return view }
        for child in view.subviews {
            if let responder = firstResponder(in: child) { return responder }
        }
        return nil
    }

    func testFullShellTracksActualSystemKeyboardAndRestoresItsHeight() async throws {
        let fixture = try await fullShell()
        defer { fixture.window.isHidden = true; fixture.viewport.close() }
        let original = fixture.webView.bounds.height
        // UIKit supplies a genuine keyboard in this window, without account data.
        let input = UITextField(frame: CGRect(x: 4, y: 4, width: 100, height: 20))
        input.alpha = 0.01
        fixture.viewport.addSubview(input)
        XCTAssertTrue(input.becomeFirstResponder())
        try await waitUntil("Keyboard appeared") {
            fixture.viewport.layoutIfNeeded()
            return fixture.webView.bounds.height < original - 100
        }
        XCTAssertEqual(fixture.webView.frame.maxY, fixture.viewport.keyboardLayoutGuide.layoutFrame.minY, accuracy: 1)
        try await assertConversation(fixture.webView, docked: false)
        try await attach(fixture.webView, name: "Actual keyboard - bounded full chat")
        input.resignFirstResponder()
        try await waitUntil("Keyboard closed") {
            fixture.viewport.layoutIfNeeded()
            return abs(fixture.webView.bounds.height - original) < 1
        }
        try await assertConversation(fixture.webView, docked: false)
        XCTAssertFalse(fixture.webView.scrollView.isScrollEnabled)
        try await attach(fixture.webView, name: "Keyboard closed - chat restored")
    }

    private func fullShell() async throws -> (webView: WKWebView, viewport: NativeViewportView, window: UIWindow) {
        let webView = WKWebView(frame: .zero)
        let viewport = NativeViewportView(webView)
        let controller = UIViewController()
        controller.view = viewport
        let scene = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first
        let window: UIWindow
        if let scene {
            window = UIWindow(windowScene: scene)
            window.frame = scene.coordinateSpace.bounds
        } else {
            window = UIWindow(frame: UIScreen.main.bounds)
        }
        window.rootViewController = controller
        window.makeKeyAndVisible()
        window.layoutIfNeeded()
        let publicRoot = try XCTUnwrap(Bundle.main.resourceURL?.appendingPathComponent("public"))
        let page = publicRoot.appendingPathComponent("phone-layout-fixture.html")
        XCTAssertTrue(FileManager.default.fileExists(atPath: page.path))
        webView.loadFileURL(page, allowingReadAccessTo: publicRoot)
        for _ in 0..<150 {
            if (try? await webView.evaluateJavaScript("document.body?.dataset.layoutReady === 'true'")) as? Bool == true {
                return (webView, viewport, window)
            }
            if let error = try? await webView.evaluateJavaScript("document.documentElement?.dataset.layoutError ?? ''"), let message = error as? String, !message.isEmpty {
                window.isHidden = true
                XCTFail("Full shell fixture: " + message)
                throw NSError(domain: "PhoneLayout", code: 3)
            }
            try await Task.sleep(nanoseconds: 100_000_000)
        }
        window.isHidden = true
        XCTFail("Full shell fixture did not load")
        throw NSError(domain: "PhoneLayout", code: 1)
    }

    private func assertConversation(_ webView: WKWebView, docked: Bool) async throws {
        try await Task.sleep(nanoseconds: 150_000_000)
        let value = try await webView.evaluateJavaScript("""
          (() => {
            const rect = selector => document.querySelector(selector).getBoundingClientRect();
            const shell = rect('#app-shell'), composer = rect('.chat-composer');
            const history = rect('.chat-history'), panel = document.querySelector('.emoji-composer-panel');
            const visible = selector => getComputedStyle(document.querySelector(selector)).display !== 'none';
            const viewport = window.visualViewport;
            const bottom = (viewport?.offsetTop ?? 0) + (viewport?.height ?? innerHeight);
            return {
              navigationHidden: !visible('.mobile-nav') && !visible('.brand-bar') && !visible('.community-mobile-tabs'),
              fits: shell.bottom <= bottom + 1 && shell.top >= (viewport?.offsetTop ?? 0) - 1,
              historyAboveComposer: history.bottom <= composer.top + 1,
              composerVisible: composer.bottom <= bottom + 1 && composer.top >= shell.top,
              docked: !!panel,
              dockFits: !panel || (panel.getBoundingClientRect().top >= composer.bottom - 1 && panel.getBoundingClientRect().bottom <= shell.bottom + 1),
              realEmoji: !panel || !!panel.querySelector('[data-grid] button'),
              searchAligned: !panel || getComputedStyle(panel.querySelector('.emoji-search')).display === 'flex'
            };
          })()
        """)
        let metrics = try XCTUnwrap(value as? [String: Bool])
        XCTAssertEqual(metrics["docked"], docked, "\(metrics)")
        for key in ["navigationHidden", "fits", "historyAboveComposer", "composerVisible", "dockFits", "realEmoji", "searchAligned"] {
            XCTAssertEqual(metrics[key], true, "\(key): \(metrics)")
        }
        if docked { try await attach(webView, name: "Full shell - emoji replaces conversation space") }
    }

    private func waitUntil(_ reason: String, _ check: () -> Bool) async throws {
        for _ in 0..<100 {
            if check() { return }
            try await Task.sleep(nanoseconds: 100_000_000)
        }
        XCTFail(reason)
        throw NSError(domain: "PhoneLayout", code: 2)
    }

    private func attach(_ webView: WKWebView, name: String) async throws {
        let picture = try await webView.takeSnapshot(configuration: nil)
        let attachment = XCTAttachment(image: picture)
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    func testPageThemeUpdatesSystemAreaAndStatusBarContrast() async {
        let webView = WKWebView(frame: .zero)
        let viewport = NativeViewportView(webView)
        defer { viewport.close() }
        for (color, style) in [("#000000", UIStatusBarStyle.lightContent), ("#f4f6fb", UIStatusBarStyle.darkContent)] {
            let changed = expectation(description: "Theme " + color)
            var observed = false
            viewport.appearanceChanged = { [weak viewport] in
                guard !observed, webView.themeColor != nil, viewport?.statusBarStyle == style else { return }
                observed = true
                changed.fulfill()
            }
            webView.loadHTMLString("<html><head><meta name=\"theme-color\" content=\"" + color + "\"></head><body>Synthetic theme fixture</body></html>", baseURL: nil)
            await fulfillment(of: [changed], timeout: 10)
            XCTAssertEqual(viewport.backgroundColor, webView.themeColor)
            XCTAssertEqual(viewport.statusBarStyle, style)
        }
    }

}
