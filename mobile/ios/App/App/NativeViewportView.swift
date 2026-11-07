import UIKit
import WebKit

/** Owns top/side viewport protection, bottom background extension and native theme chrome. */
final class NativeViewportView: UIView {
    private var themeObservation: NSKeyValueObservation?
    var appearanceChanged: (() -> Void)?
    private(set) var statusBarStyle: UIStatusBarStyle = .lightContent

    init(_ webView: WKWebView) {
        super.init(frame: .zero)
        backgroundColor = .black
        webView.translatesAutoresizingMaskIntoConstraints = false
        // Native geometry protects top/side controls; CSS owns bottom safe-area padding.
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.scrollView.isScrollEnabled = false
        if #available(iOS 17.0, *) {
            keyboardLayoutGuide.usesBottomSafeArea = false
        }
        addSubview(webView)
        NSLayoutConstraint.activate([
            webView.topAnchor.constraint(equalTo: safeAreaLayoutGuide.topAnchor),
            // The keyboard owns the available height. When hidden, the page
            // paints beneath the home indicator; CSS protects bottom controls.
            webView.bottomAnchor.constraint(equalTo: keyboardLayoutGuide.topAnchor),
            webView.leadingAnchor.constraint(equalTo: safeAreaLayoutGuide.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: safeAreaLayoutGuide.trailingAnchor)
        ])
        themeObservation = webView.observe(\.themeColor, options: [.initial, .new]) { [weak self] webView, _ in
            let color = webView.themeColor ?? .black
            DispatchQueue.main.async { [weak self] in self?.displayTheme(color) }
        }
    }

    private func displayTheme(_ color: UIColor) {
        backgroundColor = color
        var red: CGFloat = 0, green: CGFloat = 0, blue: CGFloat = 0, alpha: CGFloat = 0
        color.getRed(&red, green: &green, blue: &blue, alpha: &alpha)
        statusBarStyle = red * 0.299 + green * 0.587 + blue * 0.114 > 0.6 ? .darkContent : .lightContent
        appearanceChanged?()
    }

    func close() { themeObservation?.invalidate(); themeObservation = nil }

    required init?(coder: NSCoder) { fatalError("Use the packaged WebView initializer.") }
}
