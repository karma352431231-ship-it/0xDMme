import Foundation
import WebKit
import UIKit

/** Main-thread owner of frame/document authorization and bounded wire replies. */
final class NativeSessionChannel: NSObject, WKScriptMessageHandlerWithReply {
    private weak var view: WKWebView?
    private let session: NativeSession
    private let protectedView: NativeViewOnce
    private let parser = DispatchQueue(label: "app.zeroxdmme.native-wire")
    private var generation: UInt64 = 0
    private var document: String?
    private var committed = false
    private var closed = false
    private var pending = 0
    private var characters = 0
    private var calls: Set<String> = []

    init(_ view: WKWebView, session: NativeSession, presenter: UIViewController? = nil) {
        self.view = view; self.session = session
        self.protectedView = NativeViewOnce(presenter: presenter, protectedState: session.protectView)
        super.init()
        view.configuration.userContentController.addScriptMessageHandler(self, contentWorld: .page, name: "zeroXSession")
    }

    private var local: Bool {
        guard let url = view?.url else { return false }
        return url.scheme == "capacitor" && url.host == "localhost" && url.port == nil && url.user == nil && url.password == nil
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage, replyHandler: @escaping (Any?, String?) -> Void) {
        guard !closed, message.webView === view, message.frameInfo.isMainFrame,
              message.frameInfo.securityOrigin.protocol == "capacitor",
              message.frameInfo.securityOrigin.host == "localhost",
              message.frameInfo.securityOrigin.port == 0, local else {
            replyHandler(nil, "The app connection is unavailable."); return
        }
        guard let text = message.body as? String, text.utf16.count <= 11_210_000,
              pending < 24, characters + text.utf16.count <= 22_420_000 else {
            replyHandler(nil, "The app connection is unavailable."); close(); return
        }
        let current = generation
        let size = text.utf16.count
        pending += 1; characters += size
        parser.async { [self] in
            do {
                let wire = try NativePolicy.Message(text)
                DispatchQueue.main.async { [self] in authorize(wire, size: size, current: current, reply: replyHandler) }
            } catch {
                DispatchQueue.main.async { [self] in
                    release(size)
                    replyHandler(nil, "The app connection is unavailable.")
                    if current == generation { close() }
                }
            }
        }
    }

    private func authorize(_ message: NativePolicy.Message, size: Int, current: UInt64, reply: @escaping (Any?, String?) -> Void) {
        guard !closed, current == generation, local, calls.insert(message.call).inserted, let view else {
            release(size); reply(nil, "The app connection is unavailable."); return
        }
        var sent = false // Accessed only inside posted main-thread completion.
        let answer: NativeSession.Reply = { [weak self] result in
            DispatchQueue.main.async {
                guard !sent else { return }; sent = true
                guard let self else { reply(nil, "The app connection is unavailable."); return }
                self.release(size)
                if current == self.generation { self.calls.remove(message.call) }
                guard !self.closed, current == self.generation, self.local else {
                    reply(nil, "The app connection is unavailable."); return
                }
                do {
                    let value: [String: Any]
                    switch result {
                    case .success(let data): value = ["call": message.call, "value": data]
                    case .failure: value = ["call": message.call, "error": true]
                    }
                    let bytes = try JSONSerialization.data(withJSONObject: value)
                    guard let text = String(data: bytes, encoding: .utf8), text.utf16.count <= 48_000 else { throw NativeFailure.unavailable }
                    reply(text, nil)
                } catch { reply(nil, "The app connection is unavailable."); self.close() }
            }
        }
        view.evaluateJavaScript("window.__zeroXSessionDocument") { [weak self] nonce, error in
            guard let self, !self.closed, current == self.generation, self.local,
                  error == nil, nonce as? String == message.document else { answer(.failure(NativeFailure.unavailable)); return }
            if !self.committed {
                if message.operation == "hello" && message.request.isEmpty { answer(.success(false)) }
                else { answer(.failure(NativeFailure.unavailable)) }
                return
            }
            if self.document == nil && message.operation == "hello" { self.document = message.document }
            guard self.document == message.document else { answer(.failure(NativeFailure.unavailable)); return }
            switch message.operation {
            case "hello":
                if !message.request.isEmpty { answer(.failure(NativeFailure.unavailable)) }
                else { self.session.ready(answer) }
            case "open": self.session.open(message.request, reply: answer)
            case "read": self.session.read(message.request, reply: answer)
            case "cancel": self.session.cancel(message.request, reply: answer)
            case "view-begin", "view-append", "view-show", "view-active", "view-close":
                do { answer(.success(try self.protectedView.dispatch(message.operation, message.request))) }
                catch { answer(.failure(error)) }
            default: answer(.failure(NativeFailure.unavailable))
            }
        }
    }

    private func release(_ size: Int) { pending -= 1; characters -= size }

    func navigationStarted() {
        protectedView.close()
        generation += 1; document = nil; committed = false; calls.removeAll()
        session.cancelDocument()
    }

    func navigationCommitted() { committed = local }

    func close() {
        if closed { return }
        protectedView.close()
        closed = true; generation += 1; document = nil; calls.removeAll()
        view?.configuration.userContentController.removeScriptMessageHandler(forName: "zeroXSession", contentWorld: .page)
        session.close()
    }
}

/** Preserves Capacitor navigation behavior while observing main-document life.
 * Optional delegate methods not owned here are forwarded to Capacitor.
 */
@MainActor
final class NativeNavigationGuard: NSObject, WKNavigationDelegate {
    private let channel: NativeSessionChannel
    private let files: NativeFileExport
    private weak var downstream: WKNavigationDelegate?
    init(_ channel: NativeSessionChannel, files: NativeFileExport, downstream: WKNavigationDelegate?) {
        self.channel = channel; self.files = files; self.downstream = downstream
    }
    override func responds(to selector: Selector!) -> Bool { super.responds(to: selector) || (downstream?.responds(to: selector) ?? false) }
    override func forwardingTarget(for selector: Selector!) -> Any? { downstream }
    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        if let policy = files.policy(action) { decisionHandler(policy); return }
        let selector = NSSelectorFromString("webView:decidePolicyForNavigationAction:decisionHandler:")
        if let downstream, downstream.responds(to: selector) {
            downstream.webView?(webView, decidePolicyFor: action, decisionHandler: decisionHandler)
        } else { decisionHandler(.allow) }
    }
    func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) { files.begin(download, action: navigationAction) }
    func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
        files.cancel()
        channel.navigationStarted()
        downstream?.webView?(webView, didStartProvisionalNavigation: navigation)
    }
    func webView(_ webView: WKWebView, didCommit navigation: WKNavigation!) {
        channel.navigationCommitted()
        downstream?.webView?(webView, didCommit: navigation)
    }
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        channel.close()
        downstream?.webViewWebContentProcessDidTerminate?(webView)
    }
}
