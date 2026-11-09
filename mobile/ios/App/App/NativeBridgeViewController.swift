import Capacitor
import KeyboardPlugin
import UIKit
import WebKit

/** Composes native owners before Capacitor loads any packaged product script. */
final class NativeBridgeViewController: CAPBridgeViewController {
    private var sessionChannel: NativeSessionChannel?
    private var navigationGuard: NativeNavigationGuard?
    private var fileExport: NativeFileExport?

    override var preferredStatusBarStyle: UIStatusBarStyle {
        (viewIfLoaded as? NativeViewportView)?.statusBarStyle ?? .lightContent
    }

    override func capacitorDidLoad() {
        guard let webView else { return }
        let viewport = NativeViewportView(webView)
        viewport.appearanceChanged = { [weak self] in self?.setNeedsStatusBarAppearanceUpdate() }
        view = viewport
        // The official keyboard plugin removes the iPhone form accessory bar.
        // Resize is disabled in its config: NativeViewportView owns geometry.
        guard let keyboard = NSClassFromString("KeyboardPlugin") as? CAPPlugin.Type else {
            preconditionFailure("The packaged native keyboard plugin is unavailable.")
        }
        bridge?.registerPluginInstance(keyboard.init())
        precondition(bridge?.plugin(withName: "Keyboard") != nil, "The native keyboard plugin did not load.")
        do {
            let owner = NativeSession(try NativeConnectionFactory.configuration())
            let channel = NativeSessionChannel(webView, session: owner)
            sessionChannel = channel
            let files = NativeFileExport(webView, presenter: self)
            fileExport = files
            navigationGuard = NativeNavigationGuard(channel, files: files, downstream: webView.navigationDelegate)
            webView.navigationDelegate = navigationGuard
        } catch {
            // No native channel means the installed entry fails explicitly;
            // there is no network/storage fallback and no product session load.
            sessionChannel = nil
        }
    }

    func cancelFileExport() { fileExport?.cancel() }
    func closeSession() { (viewIfLoaded as? NativeViewportView)?.close(); fileExport?.close(); sessionChannel?.close() }
}
