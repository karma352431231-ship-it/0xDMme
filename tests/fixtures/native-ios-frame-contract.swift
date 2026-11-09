#if DEBUG && MOBILE_SYNTHETIC_TEST
import Foundation
import UIKit
import WebKit
import XCTest
@testable import App

/** Actual WK frame/document boundary using the ordinary native channel, in a
 * private minimal host with a separate synthetic cookie namespace. No product
 * account, remote page, network request or decrypted content is opened.
 */
@MainActor
final class NativeFrameContractTests: XCTestCase {
    private func harness() throws -> NativeSyntheticFrameHarness {
        guard Bundle.main.bundleIdentifier == "app.zeroxdmme.development.recovery",
              Bundle.main.url(forResource: "native-custody-contract", withExtension: "json") != nil else {
            throw NSError(domain: "NativeFrameFixture", code: 1)
        }
        let value = NativeSyntheticFrameHarness(try NativeConnectionFactory.configuration())
        addTeardownBlock { @MainActor in value.close() }
        return value
    }

    func testMainFrameWorksWhileSameOriginSubframeIsRejected() async throws {
        let value = try harness()
        try await value.load(host: "localhost", path: "/main")
        try await value.ready()
        let result = try await value.script("""
            return await new Promise(resolve => {
                let finished = false;
                const finish = result => { if (finished) return; finished = true; clearTimeout(timer); removeEventListener('message', received); frame.remove(); resolve(result); };
                const received = event => { if (event.source === frame.contentWindow) finish(event.data); };
                const frame = document.createElement('iframe');
                const timer = setTimeout(() => finish('timeout'), 8000);
                addEventListener('message', received);
                frame.src = 'capacitor://localhost/child'; document.body.append(frame);
            });
            """)
        XCTAssertEqual(result, "present:rejected")
        try await value.ready()
    }

    func testWrongAndReplacedNonceRejectUntilActualDocumentNavigation() async throws {
        let value = try harness()
        try await value.load(host: "localhost", path: "/first")
        try await value.ready()
        let wrong = try await value.script("return await window.contractCall(crypto.randomUUID());")
        XCTAssertEqual(wrong, "rejected")
        let replaced = try await value.script("window.__zeroXSessionDocument = crypto.randomUUID(); return await window.contractCall();")
        XCTAssertEqual(replaced, "rejected")
        try await value.load(host: "localhost", path: "/second")
        try await value.ready()
    }

    func testNonlocalOriginAndMalformedWireFailClosed() async throws {
        let foreign = try harness()
        try await foreign.load(host: "untrusted.invalid", path: "/foreign")
        let result = try await foreign.script("return await window.contractCall();")
        XCTAssertEqual(result, "rejected")
        foreign.close()
        let local = try harness()
        try await local.load(host: "localhost", path: "/malformed")
        try await local.ready()
        let malformed = try await local.script("try { await window.webkit.messageHandlers.zeroXSession.postMessage({untrusted: true}); return 'accepted'; } catch { return 'rejected'; }")
        XCTAssertEqual(malformed, "rejected")
        let closed = try await local.script("return await window.contractCall();")
        XCTAssertEqual(closed, "rejected")
    }
}

@MainActor
private final class NativeSyntheticFrameHarness: NSObject, WKURLSchemeHandler, WKNavigationDelegate {
    private var view: WKWebView!
    private var channel: NativeSessionChannel!
    private var loaded = false
    private var stopped = false

    init(_ connection: NativeConnectionConfiguration) {
        super.init()
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .nonPersistent()
        configuration.setURLSchemeHandler(self, forURLScheme: "capacitor")
        view = WKWebView(frame: CGRect(x: 0, y: 0, width: 390, height: 700), configuration: configuration)
        let session = NativeSession(connection)
        channel = NativeSessionChannel(view, session: session)
        view.navigationDelegate = self
    }

    func load(host: String, path: String) async throws {
        loaded = false
        view.load(URLRequest(url: URL(string: "capacitor://" + host + path)!))
        let deadline = Date().addingTimeInterval(15)
        while Date() < deadline {
            if loaded { return }
            try await Task.sleep(nanoseconds: 100_000_000)
        }
        throw NSError(domain: "NativeFrameFixtureDeadline", code: 1)
    }

    func ready() async throws {
        let deadline = Date().addingTimeInterval(25)
        while Date() < deadline {
            let result = try await script("return await window.contractCall();")
            if result == "ready" { return }
            guard result == "pending" else { throw NSError(domain: "NativeFrameFixtureRejected", code: 1) }
            try await Task.sleep(nanoseconds: 100_000_000)
        }
        throw NSError(domain: "NativeFrameFixtureDeadline", code: 2)
    }

    func script(_ body: String) async throws -> String {
        let result = try await view.callAsyncJavaScript(body, arguments: [:], in: nil, contentWorld: .page)
        guard let result = result as? String else { throw NSError(domain: "NativeFrameFixtureResult", code: 1) }
        return result
    }

    func close() {
        guard !stopped else { return }; stopped = true
        channel.close(); view.stopLoading(); view.navigationDelegate = nil
        view = nil
    }

    func webView(_ webView: WKWebView, start urlSchemeTask: WKURLSchemeTask) {
        guard let url = urlSchemeTask.request.url else { return }
        let child = url.path == "/child"
        let html = """
            <!doctype html><html><body><script>
            window.__zeroXSessionDocument = crypto.randomUUID();
            window.contractCall = async (documentId = window.__zeroXSessionDocument) => {
                try {
                    const wire = {call: crypto.randomUUID(), document: documentId, operation: 'hello', request: {}};
                    const raw = await window.webkit.messageHandlers.zeroXSession.postMessage(JSON.stringify(wire));
                    const result = JSON.parse(raw);
                    return result.value === true ? 'ready' : result.value === false ? 'pending' : 'rejected';
                } catch { return 'rejected'; }
            };
            \(child ? "window.contractCall().then(value => parent.postMessage((window.webkit?.messageHandlers?.zeroXSession ? 'present:' : 'missing:') + value, '*'));" : "")
            </script></body></html>
            """
        let bytes = Data(html.utf8)
        urlSchemeTask.didReceive(URLResponse(url: url, mimeType: "text/html", expectedContentLength: bytes.count, textEncodingName: "utf-8"))
        urlSchemeTask.didReceive(bytes)
        urlSchemeTask.didFinish()
    }
    func webView(_ webView: WKWebView, stop urlSchemeTask: WKURLSchemeTask) {}
    func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) { channel.navigationStarted() }
    func webView(_ webView: WKWebView, didCommit navigation: WKNavigation!) { channel.navigationCommitted() }
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) { loaded = true }
}
#endif
