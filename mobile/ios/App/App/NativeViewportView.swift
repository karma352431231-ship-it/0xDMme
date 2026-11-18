import UIKit
import WebKit

/** Owns top/side viewport protection, bottom background extension and native theme chrome. */
final class NativeViewportView: UIView {
    private var themeObservation: NSKeyValueObservation?
    private var offsetObservation: NSKeyValueObservation?
    var appearanceChanged: (() -> Void)?
    private(set) var statusBarStyle: UIStatusBarStyle = .lightContent

    init(_ webView: WKWebView) {
        super.init(frame: .zero)
        backgroundColor = .black
        webView.translatesAutoresizingMaskIntoConstraints = false
        // Native geometry protects top/side controls; CSS owns bottom safe-area padding.
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.scrollView.isScrollEnabled = false
        // Any edge the page leaves uncovered shows the theme color, not white.
        webView.isOpaque = false
        webView.backgroundColor = .clear
        webView.scrollView.backgroundColor = .clear
        // The page never scrolls as a whole: its own panes scroll. When the
        // keyboard opens, WebKit still shifts the whole page to reveal the
        // focused field, which flashes the app down and back (18/11/2026).
        // Pinch zoom keeps its pan.
        offsetObservation = webView.scrollView.observe(\.contentOffset, options: [.new]) { scrollView, _ in
            guard scrollView.contentOffset != .zero,
                  scrollView.zoomScale <= scrollView.minimumZoomScale + 0.01 else { return }
            scrollView.contentOffset = .zero
        }
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

    func close() {
        themeObservation?.invalidate(); themeObservation = nil
        offsetObservation?.invalidate(); offsetObservation = nil
    }

    required init?(coder: NSCoder) { fatalError("Use the packaged WebView initializer.") }
}
