#if DEBUG && MOBILE_SYNTHETIC_TEST
import Foundation
import UIKit
import WebKit

/** Private fixture observer. It owns one report and its deadline, and observes
 * public UI only. It never opens protected storage or calls product services.
 * The private builder supplies its controller hook; release targets exclude it.
 */
final class NativeDirectProductReporter: NSObject, WKScriptMessageHandlerWithReply {
    private struct Configuration {
        let run: String
        let phase: String
        let address: String
        let input: String
        let action: String

        init?() {
            let env = ProcessInfo.processInfo.environment
            guard NativeDirectProductReporter.bundles.contains(Bundle.main.bundleIdentifier ?? ""),
                  let fixture = Bundle.main.url(forResource: "native-synthetic-test", withExtension: "json"),
                  let data = try? Data(contentsOf: fixture),
                  let marker = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  (try? NativeSyntheticEndpoint(marker)) != nil,
                  let run = env["NATIVE_UI_RUN_ID"], UUID(uuidString: run)?.uuidString.lowercased() == run,
                  let phase = env["NATIVE_UI_PHASE"], ["login", "restore", "profile-prepare", "profile-restore", "profile-check", "logout", "guest", "background", "action"].contains(phase),
                  let address = env["NATIVE_UI_ADDRESS"], address.utf8.count == 42, address.range(of: "^0x[a-f0-9]{40}$", options: .regularExpression) != nil,
                  let input = env["NATIVE_UI_INPUT"], input.utf8.count <= 1024 else { return nil }
            let action = env["NATIVE_UI_ACTION"] ?? ""
            if phase.hasPrefix("profile-") {
                guard input.count <= 80, input.hasPrefix("Synthetic iPhone "), input.rangeOfCharacter(from: .controlCharacters) == nil else { return nil }
            } else if phase == "action" {
                guard action.utf8.count <= 64, action.rangeOfCharacter(from: .controlCharacters) == nil,
                      NativePolicy.matches(action, "^[a-z][a-z-]{2,63}$") else { return nil }
            } else if !input.isEmpty { return nil }
            if phase != "action" && !action.isEmpty { return nil }
            self.run = run; self.phase = phase; self.address = address; self.input = input; self.action = action
        }

        var dictionary: [String: String] { ["run": run, "phase": phase, "address": address, "input": input, "action": action] }
    }

    private static let handler = "zeroXProductTestResult"
    private static let bundles: Set<String> = ["app.zeroxdmme.development", "app.zeroxdmme.development.peer", "app.zeroxdmme.development.recovery"]
    private let configuration: Configuration
    private weak var view: WKWebView?
    private weak var proofLabel: UILabel?
    private let started = DispatchTime.now().uptimeNanoseconds
    private var timer: DispatchWorkItem?
    private var progressTimers: [DispatchWorkItem] = []
    private var progressObserving = false
    private var finished = false
    private var observing = false
    private var lifecycleObservers: [NSObjectProtocol] = []
    private var enteredBackground = false
    private var returnedForeground = false

    init?(_ view: WKWebView) {
        guard let config = Configuration(),
              let data = try? JSONSerialization.data(withJSONObject: config.dictionary, options: .sortedKeys),
              let json = String(data: data, encoding: .utf8) else { return nil }
        configuration = config; self.view = view
        super.init()
        view.accessibilityIdentifier = "0xDMmeSyntheticProduct"
        if ProcessInfo.processInfo.environment["NATIVE_UI_EXECUTOR"] == "xcuitest" {
            let label = UILabel(frame: CGRect(x: 8, y: 8, width: 230, height: 20))
            label.text = "Synthetic mobile test"
            label.textColor = .label
            label.backgroundColor = .systemBackground
            label.font = .systemFont(ofSize: 11)
            label.isUserInteractionEnabled = false
            label.isAccessibilityElement = true
            label.accessibilityIdentifier = "0xDMmeSyntheticReport"
            view.addSubview(label)
            proofLabel = label
        }
        let controller = view.configuration.userContentController
        controller.addScriptMessageHandler(self, contentWorld: .page, name: Self.handler)
        controller.addUserScript(WKUserScript(source: "Object.defineProperty(window, '__zeroXNativeRun', { value: Object.freeze(\(json)) });", injectionTime: .atDocumentStart, forMainFrameOnly: true))
        let deadline = DispatchWorkItem { [weak self] in self?.finish(passed: false, code: "native-observation-deadline", checks: [:]) }
        timer = deadline
        DispatchQueue.main.asyncAfter(deadline: .now() + 300, execute: deadline)
        // Two bounded, public-UI snapshots make an incomplete phase diagnosable
        // without opening protected owners or exporting visible content.
        for delay in [15, 90] {
            let observation = DispatchWorkItem { [weak self] in self?.progress() }
            progressTimers.append(observation)
            DispatchQueue.main.asyncAfter(deadline: .now() + .seconds(delay), execute: observation)
        }
        if config.phase == "background" { observeLifecycle() }
    }

    func close() {
        guard !finished else { return }
        finish(passed: false, code: "observer-closed", checks: [:])
    }

    private var local: Bool {
        guard let url = view?.url else { return false }
        return url.scheme == "capacitor" && url.host == "localhost" && url.port == nil && url.user == nil && url.password == nil
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage, replyHandler: @escaping (Any?, String?) -> Void) {
        guard !finished, !observing, local, message.webView === view,
              message.frameInfo.isMainFrame, message.frameInfo.securityOrigin.protocol == "capacitor",
              message.frameInfo.securityOrigin.host == "localhost", message.frameInfo.securityOrigin.port == 0,
              let text = message.body as? String, text.utf8.count <= 4096,
              let data = text.data(using: .utf8),
              let report = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              Set(report.keys) == Set(configuration.phase == "action" ? ["run", "phase", "nonce", "passed", "reason", "output"] : ["run", "phase", "nonce", "passed", "reason"]),
              report["run"] as? String == configuration.run, report["phase"] as? String == configuration.phase,
              let passed = report["passed"] as? NSNumber, CFGetTypeID(passed) == CFBooleanGetTypeID(),
              let nonce = report["nonce"] as? String, nonce.utf8.count <= 128,
              report["reason"] as? String == (passed.boolValue ? "" : "ui-phase-failed") else {
            replyHandler(nil, "Native fixture observation rejected."); return
        }
        observing = true
        guard passed.boolValue else {
            replyHandler(true, nil)
            finish(passed: false, code: "public-ui-phase-failed", checks: [:]); return
        }
        let output: NativeDirectProductOutput?
        if configuration.phase == "action" {
            guard let value = report["output"] as? String,
                  let valid = try? NativeDirectProductOutput(action: configuration.action, value: value) else {
                replyHandler(nil, "Native fixture output rejected.")
                finish(passed: false, code: "native-fixture-output-rejected", checks: [:]); return
            }
            output = valid
        } else { output = nil }
        observe(nonce: nonce, output: output, reply: replyHandler)
    }

    private func observe(nonce: String, output: NativeDirectProductOutput?, reply: @escaping (Any?, String?) -> Void) {
        // Only boolean observations leave the native process. Expected synthetic
        // values and the document nonce are compared locally and never printed.
        let source = """
        (() => {
          const c = window.__zeroXNativeRun;
          const d = document;
          const profile = c.phase.startsWith('profile-');
          const loggedOut = c.phase === 'logout' || c.phase === 'guest';
          const expectedTheme = c.phase === 'profile-prepare' ? 'white' : 'navy';
          return {
            nonce: window.__zeroXSessionDocument || '',
            origin: location.origin === 'capacitor://localhost',
            secure: isSecureContext,
            nativeChannel: !!window.webkit?.messageHandlers?.zeroXSession,
            cookieIsolation: d.cookie === '',
            phoneViewport: innerWidth > 0 && innerWidth <= 500,
            accountState: d.querySelector('#app-shell')?.dataset.account === (loggedOut ? 'guest' : 'connected'),
            privateState: loggedOut ? !d.querySelector('[data-private-profile]') || d.querySelector('[data-private-profile]').hidden : d.querySelector('[data-private-profile]')?.hidden === false,
            walletState: loggedOut ? !d.querySelector('[data-account-address]')?.getAttribute('title') : d.querySelector('[data-account-address]')?.title.toLowerCase() === 'wallet evm: ' + c.address,
            profileName: !profile || d.querySelector('[data-profile-name]')?.textContent === c.input,
            preferences: !profile || (d.querySelector('[name=backupReminder]')?.checked === false && d.querySelector('[name=readReceipts]')?.checked === false),
            theme: !profile || d.documentElement.dataset.theme === expectedTheme
          };
        })()
        """
        view?.evaluateJavaScript(source) { [weak self] value, error in
            guard let self, !self.finished else { reply(nil, "Native fixture observation expired."); return }
            var checks = self.nativeChecks()
            let snapshot = value as? [String: Any]
            checks["currentDocument"] = !nonce.isEmpty && snapshot?["nonce"] as? String == nonce
            for key in ["origin", "secure", "nativeChannel", "cookieIsolation", "phoneViewport", "accountState", "privateState", "walletState", "profileName", "preferences", "theme"] {
                checks[key] = snapshot?[key] as? Bool == true
            }
            if self.configuration.phase == "background" {
                checks["enteredBackground"] = self.enteredBackground
                checks["returnedForeground"] = self.returnedForeground
            }
            if let output {
                if error == nil && checks.values.allSatisfy({ $0 }) {
                    do { try output.save(run: self.configuration.run); checks["fixtureOutput"] = true }
                    catch { checks["fixtureOutput"] = false }
                } else { checks["fixtureOutput"] = false }
            }
            let accepted = error == nil && checks.values.allSatisfy { $0 }
            reply(true, nil)
            self.finish(passed: accepted, code: accepted ? "" : "native-ui-postcondition-failed", checks: checks)
        }
    }

    private func nativeChecks() -> [String: Bool] {
        let width = view?.bounds.width ?? 0
        return [
            "localDocument": local,
            "foreground": view?.window?.windowScene?.activationState == .foregroundActive,
            "visiblePhone": view?.window != nil && view?.isHidden == false && width > 0 && width <= 500,
            "testBundle": Self.bundles.contains(Bundle.main.bundleIdentifier ?? "")
        ]
    }

    private func observeLifecycle() {
        let center = NotificationCenter.default
        lifecycleObservers.append(center.addObserver(forName: UIApplication.didEnterBackgroundNotification, object: nil, queue: .main) { [weak self] _ in
            guard let self, !self.finished else { return }
            self.enteredBackground = true
        })
        lifecycleObservers.append(center.addObserver(forName: UIApplication.didBecomeActiveNotification, object: nil, queue: .main) { [weak self] _ in
            guard let self, !self.finished, self.enteredBackground, self.local else { return }
            self.returnedForeground = true
            self.view?.evaluateJavaScript("window.__zeroXNativeBackgroundResumed = true") { [weak self] _, error in
                guard let self, !self.finished else { return }
                if error != nil { self.finish(passed: false, code: "lifecycle-resume-observation-failed", checks: [:]) }
            }
        })
    }

    private func progress() {
        guard !finished, !progressObserving else { return }
        guard local else { emitProgress(nativeChecks()); return }
        progressObserving = true
        let source = """
        (() => {
          const d = document;
          const finish = d.querySelector('[data-account-finish]');
          const step = window.__zeroXNativeStep;
          const approval = d.querySelector('[data-wallet-approve]');
          return {
            mounted: !!d.querySelector('#app-shell')?.dataset.page,
            connected: d.querySelector('#app-shell')?.dataset.account === 'connected',
            privateReady: d.querySelector('[data-private-profile]')?.hidden === false,
            finishAvailable: !!finish && !finish.hidden && !finish.disabled && finish.getClientRects().length > 0,
            entryFailed: d.querySelector('body > [role=alert]')?.textContent?.includes('The app connection could not start.') === true,
            secure: isSecureContext,
            cookieIsolation: d.cookie === '',
            atMounted: step === 'mounted',
            atAccountPage: step === 'account-page',
            atWalletPicker: step === 'wallet-picker',
            atWalletBrand: step === 'wallet-brand',
            atWalletNetwork: step === 'wallet-network',
            atAuthenticated: step === 'authenticated',
            atPrivateReady: step === 'private-ready',
            atComplete: step === 'complete',
            accountVerifying: d.querySelector('[data-account-status]')?.textContent === 'Verificando sessão…',
            approvalAvailable: !!approval && !approval.hidden && !approval.disabled && approval.getClientRects().length > 0
          };
        })()
        """
        view?.evaluateJavaScript(source) { [weak self] value, error in
            guard let self, !self.finished else { return }
            self.progressObserving = false
            var checks = self.nativeChecks()
            checks["publicEvaluation"] = error == nil
            let snapshot = value as? [String: Any]
            for key in ["mounted", "connected", "privateReady", "finishAvailable", "entryFailed", "secure", "cookieIsolation", "atMounted", "atAccountPage", "atWalletPicker", "atWalletBrand", "atWalletNetwork", "atAuthenticated", "atPrivateReady", "atComplete", "accountVerifying", "approvalAvailable"] {
                checks[key] = snapshot?[key] as? Bool == true
            }
            if self.configuration.phase == "background", checks["connected"] == true,
               checks["privateReady"] == true, checks["foreground"] == true {
                self.proofLabel?.accessibilityValue = "NATIVE_READY:background"
            }
            self.emitProgress(checks)
        }
    }

    private func emitProgress(_ checks: [String: Bool]) {
        let value: [String: Any] = ["run": configuration.run, "phase": configuration.phase, "checks": checks]
        guard let bytes = try? JSONSerialization.data(withJSONObject: value, options: .sortedKeys),
              let json = String(data: bytes, encoding: .utf8) else { return }
        print("NATIVE_DIRECT_PRODUCT_PROGRESS:" + json)
        fflush(stdout)
    }

    private func finish(passed: Bool, code: String, checks: [String: Bool]) {
        guard !finished else { return }
        finished = true
        timer?.cancel(); timer = nil
        progressTimers.forEach { $0.cancel() }; progressTimers.removeAll()
        lifecycleObservers.forEach { NotificationCenter.default.removeObserver($0) }; lifecycleObservers.removeAll()
        view?.configuration.userContentController.removeScriptMessageHandler(forName: Self.handler, contentWorld: .page)
        let result: [String: Any] = [
            "schema": 1, "run": configuration.run, "phase": configuration.phase,
            "passed": passed, "processId": ProcessInfo.processInfo.processIdentifier,
            "elapsedMs": (DispatchTime.now().uptimeNanoseconds - started) / 1_000_000,
            "checks": checks, "failureCode": code
        ]
        guard let data = try? JSONSerialization.data(withJSONObject: result, options: .sortedKeys),
              let json = String(data: data, encoding: .utf8) else { return }
        proofLabel?.accessibilityValue = "NATIVE_RESULT:" + json
        print("NATIVE_DIRECT_PRODUCT_RESULT:" + json)
        fflush(stdout)
    }
}
#endif
