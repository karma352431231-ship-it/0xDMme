import UIKit
import AVFoundation
import CoreText
import ImageIO
import UniformTypeIdentifiers

/** The renderer uses AVFoundation's public protected layer for every sensitive pixel. */
final class NativeViewOnce: NSObject {
    private weak var presenter: UIViewController?
    private var screen: NativeViewOnceController?
    private let protectedState: (Bool) -> Void

    init(presenter: UIViewController?, protectedState: @escaping (Bool) -> Void) {
        self.presenter = presenter
        self.protectedState = protectedState
        super.init()
        NotificationCenter.default.addObserver(self, selector: #selector(suspend),
            name: UIApplication.willResignActiveNotification, object: nil)
    }
    deinit { NotificationCenter.default.removeObserver(self) }

    func dispatch(_ operation: String, _ input: [String: Any]) throws -> Bool {
        if operation == "view-begin" { return try begin(input) }
        let id = try NativePolicy.id(input["id"])
        if operation == "view-active" {
            guard Set(input.keys) == ["id"] else { throw NativeFailure.unavailable }
            return screen?.identifier == id
        }
        if operation == "view-close" {
            guard Set(input.keys) == ["id"] else { throw NativeFailure.unavailable }
            if screen?.identifier == id { close() }
            return true
        }
        guard let screen, screen.identifier == id else { throw NativeFailure.unavailable }
        switch operation {
        case "view-append": try screen.append(input)
        case "view-show": try screen.show(input)
        default: throw NativeFailure.unavailable
        }
        return true
    }
    private func begin(_ input: [String: Any]) throws -> Bool {
        guard Set(input.keys) == ["id", "mime", "bytes"], screen == nil,
              let presenter, presenter.viewIfLoaded?.window != nil,
              presenter.presentedViewController == nil,
              UIApplication.shared.applicationState == .active else { throw NativeFailure.unavailable }
        let id = try NativePolicy.id(input["id"])
        let mime = try NativePolicy.text(input["mime"], 128)
        let bytes = try NativePolicy.integer(input["bytes"], minimum: 0, maximum: 10_000_000)
        if mime == "text/plain" {
            guard bytes == 0 else { throw NativeFailure.unavailable }
        } else {
            guard bytes > 0, let type = UTType(mimeType: mime), type.conforms(to: .image),
                  (CGImageSourceCopyTypeIdentifiers() as! [String]).contains(type.identifier)
            else { throw NativeFailure.unavailable }
        }
        let controller = NativeViewOnceController(id: id, mime: mime, bytes: bytes)
        controller.finished = { [weak self, weak controller] in
            guard let self, self.screen === controller else { return }
            self.close()
        }
        controller.modalPresentationStyle = .fullScreen
        controller.loadViewIfNeeded()
        screen = controller
        presenter.present(controller, animated: false)
        protectedState(true)
        return true
    }
    @objc private func suspend() { close() }
    func close() {
        guard let previous = screen else { protectedState(false); return }
        screen = nil
        previous.erase()
        previous.dismiss(animated: false)
        protectedState(false)
    }
}

private final class NativeViewOnceController: UIViewController {
    let identifier: String
    private let mime: String
    private let expected: Int
    private var data = Data()
    private var text = ""
    private var image: UIImage?
    private var shown = false
    private var page = 0
    private var ranges: [CFRange] = []
    private var laidOut = CGSize.zero
    private var photoSize = CGSize.zero
    private let surface = UIView()
    private let layer = AVSampleBufferDisplayLayer()
    private let loading = UIActivityIndicatorView(style: .medium)
    private let previous = UIButton(type: .system)
    private let nextButton = UIButton(type: .system)
    private let pageLabel = UILabel()
    var finished: (() -> Void)?

    init(id: String, mime: String, bytes: Int) {
        identifier = id; self.mime = mime; expected = bytes
        super.init(nibName: nil, bundle: nil)
        data.reserveCapacity(bytes)
    }
    required init?(coder: NSCoder) { return nil }
    override var preferredStatusBarStyle: UIStatusBarStyle { .lightContent }
    override func loadView() { view = ViewOnceBackdrop(frame: .zero) }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.accessibilityViewIsModal = true
        layer.preventsCapture = true
        layer.videoGravity = .resizeAspect
        surface.clipsToBounds = true
        surface.layer.addSublayer(layer)
        surface.isAccessibilityElement = true
        surface.accessibilityLabel = "Loading view-once message"
        loading.color = ViewOnceBackdrop.muted
        loading.translatesAutoresizingMaskIntoConstraints = false
        surface.addSubview(loading)
        loading.startAnimating()

        let header = UIView()
        let close = UIButton(type: .system)
        close.setImage(UIImage(systemName: "chevron.left", withConfiguration: UIImage.SymbolConfiguration(pointSize: 16, weight: .medium)), for: .normal)
        close.backgroundColor = ViewOnceBackdrop.base
        close.layer.cornerRadius = 24
        close.accessibilityLabel = "Close view-once message"
        close.addTarget(self, action: #selector(closePressed), for: .touchUpInside)
        let badge = UIImageView(image: UIImage(systemName: "1.circle"))
        badge.tintColor = ViewOnceBackdrop.accent
        let title = UILabel()
        title.text = "View-once message"
        title.font = .systemFont(ofSize: 14, weight: .semibold)
        title.textColor = ViewOnceBackdrop.ink
        let heading = UIStackView(arrangedSubviews: [badge, title])
        heading.alignment = .center
        heading.spacing = 7
        for element in [close, heading] {
            element.translatesAutoresizingMaskIntoConstraints = false
            header.addSubview(element)
        }

        previous.setImage(UIImage(systemName: "chevron.left"), for: .normal)
        previous.accessibilityLabel = "Previous page"
        previous.addTarget(self, action: #selector(previousPage), for: .touchUpInside)
        nextButton.setImage(UIImage(systemName: "chevron.right"), for: .normal)
        nextButton.accessibilityLabel = "Next page"
        nextButton.addTarget(self, action: #selector(nextPage), for: .touchUpInside)
        pageLabel.textColor = ViewOnceBackdrop.muted
        pageLabel.font = .systemFont(ofSize: 13)
        pageLabel.textAlignment = .center
        let footer = UIView()
        for element in [previous, pageLabel, nextButton] {
            element.translatesAutoresizingMaskIntoConstraints = false
            footer.addSubview(element)
        }
        updateFooter(count: 1)
        for control in [close, previous, nextButton] { control.tintColor = ViewOnceBackdrop.ink }
        for element in [header, surface, footer] {
            element.translatesAutoresizingMaskIntoConstraints = false
            view.addSubview(element)
        }
        let safe = view.safeAreaLayoutGuide
        NSLayoutConstraint.activate([
            header.topAnchor.constraint(equalTo: safe.topAnchor),
            header.leadingAnchor.constraint(equalTo: safe.leadingAnchor),
            header.trailingAnchor.constraint(equalTo: safe.trailingAnchor),
            header.heightAnchor.constraint(equalToConstant: 56),
            close.centerYAnchor.constraint(equalTo: header.centerYAnchor),
            close.leadingAnchor.constraint(equalTo: header.leadingAnchor, constant: 12),
            close.widthAnchor.constraint(equalToConstant: 48), close.heightAnchor.constraint(equalToConstant: 48),
            heading.centerXAnchor.constraint(equalTo: header.centerXAnchor),
            heading.centerYAnchor.constraint(equalTo: header.centerYAnchor),
            heading.leadingAnchor.constraint(greaterThanOrEqualTo: close.trailingAnchor, constant: 4),
            badge.widthAnchor.constraint(equalToConstant: 19), badge.heightAnchor.constraint(equalToConstant: 19),
            surface.topAnchor.constraint(equalTo: header.bottomAnchor),
            surface.leadingAnchor.constraint(equalTo: safe.leadingAnchor),
            surface.trailingAnchor.constraint(equalTo: safe.trailingAnchor),
            surface.bottomAnchor.constraint(equalTo: footer.topAnchor),
            loading.centerXAnchor.constraint(equalTo: surface.centerXAnchor),
            loading.centerYAnchor.constraint(equalTo: surface.centerYAnchor),
            footer.leadingAnchor.constraint(equalTo: safe.leadingAnchor),
            footer.trailingAnchor.constraint(equalTo: safe.trailingAnchor),
            footer.bottomAnchor.constraint(equalTo: safe.bottomAnchor),
            footer.heightAnchor.constraint(equalToConstant: 48),
            pageLabel.centerXAnchor.constraint(equalTo: footer.centerXAnchor),
            pageLabel.centerYAnchor.constraint(equalTo: footer.centerYAnchor),
            previous.leadingAnchor.constraint(equalTo: footer.leadingAnchor, constant: 12),
            nextButton.trailingAnchor.constraint(equalTo: footer.trailingAnchor, constant: -12),
            previous.centerYAnchor.constraint(equalTo: footer.centerYAnchor),
            nextButton.centerYAnchor.constraint(equalTo: footer.centerYAnchor),
            previous.widthAnchor.constraint(equalToConstant: 44), previous.heightAnchor.constraint(equalToConstant: 44),
            nextButton.widthAnchor.constraint(equalToConstant: 44), nextButton.heightAnchor.constraint(equalToConstant: 44)
        ])
    }
    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        layer.frame = surface.bounds
        if shown && surface.bounds.size != laidOut {
            do { try paginate(); try render() } catch { finished?() }
        }
    }
    func append(_ input: [String: Any]) throws {
        guard Set(input.keys) == ["id", "offset", "bytes"], !shown else { throw NativeFailure.unavailable }
        let offset = try NativePolicy.integer(input["offset"], minimum: 0, maximum: 10_000_000)
        let encoded = try NativePolicy.text(input["bytes"], 90_000)
        guard var chunk = Data(base64Encoded: encoded), chunk.count > 0,
              chunk.count <= 65_536, chunk.base64EncodedString() == encoded,
              offset == data.count, data.count + chunk.count <= expected else { throw NativeFailure.unavailable }
        defer { chunk.resetBytes(in: chunk.startIndex..<chunk.endIndex) }
        data.append(chunk)
    }
    func show(_ input: [String: Any]) throws {
        guard Set(input.keys) == ["id", "text"], !shown, data.count == expected else { throw NativeFailure.unavailable }
        text = try NativePolicy.text(input["text"], 16000)
        guard text.utf8.count <= 16000 else { throw NativeFailure.unavailable }
        if mime != "text/plain" {
            guard let source = CGImageSourceCreateWithData(data as CFData, nil),
                  let cg = CGImageSourceCreateThumbnailAtIndex(source, 0, [
                    kCGImageSourceCreateThumbnailFromImageAlways: true,
                    kCGImageSourceCreateThumbnailWithTransform: true,
                    kCGImageSourceThumbnailMaxPixelSize: 3072
                  ] as CFDictionary) else { throw NativeFailure.unavailable }
            image = UIImage(cgImage: cg)
        }
        data.resetBytes(in: data.startIndex..<data.endIndex)
        data.removeAll(keepingCapacity: false)
        shown = true
        view.layoutIfNeeded()
        try paginate()
        try render()
        loading.stopAnimating()
    }
    private var attributed: NSAttributedString {
        let paragraph = NSMutableParagraphStyle()
        paragraph.alignment = .center
        paragraph.lineSpacing = 3
        return NSAttributedString(string: text, attributes: [
            .font: UIFont.systemFont(ofSize: image == nil ? 22 : 16),
            .foregroundColor: image == nil ? ViewOnceBackdrop.ink : ViewOnceBackdrop.muted,
            .paragraphStyle: paragraph
        ])
    }
    private var textWidth: CGFloat { min(laidOut.width - 32, image == nil ? 360 : 540) }
    private var contentHeight: CGFloat { laidOut.height - 24 }
    private var captionGap: CGFloat { text.isEmpty ? 0 : 10 }

    private func textFrame(_ setter: CTFramesetter, _ range: CFRange, height: CGFloat) -> CTFrame {
        let path = CGPath(rect: CGRect(x: 0, y: 0, width: textWidth, height: height), transform: nil)
        return CTFramesetterCreateFrame(setter, range, path, nil)
    }

    private func paginate() throws {
        laidOut = surface.bounds.size
        guard laidOut.width > 40, laidOut.height > 40 else { throw NativeFailure.unavailable }
        let message = attributed
        let setter = CTFramesetterCreateWithAttributedString(message)
        ranges.removeAll()
        var location = 0
        if let image {
            let height = contentHeight * (text.isEmpty ? 1 : 0.72)
            let scale = min(min(laidOut.width - 32, 680) / image.size.width, height / image.size.height)
            photoSize = CGSize(width: image.size.width * scale, height: image.size.height * scale)
            let captionHeight = contentHeight - photoSize.height - captionGap
            let visible = captionHeight > 0 && message.length > 0
                ? CTFrameGetVisibleStringRange(textFrame(setter, CFRange(location: 0, length: 0), height: captionHeight))
                : CFRange(location: 0, length: 0)
            ranges.append(visible)
            location = visible.length
        }
        while location < message.length {
            let visible = CTFrameGetVisibleStringRange(textFrame(setter, CFRange(location: location, length: 0), height: contentHeight))
            guard visible.length > 0 else { throw NativeFailure.unavailable }
            ranges.append(visible); location += visible.length
        }
        page = min(page, max(0, ranges.count - 1))
    }

    private func usedHeight(_ frame: CTFrame, height: CGFloat) -> CGFloat {
        let lines = CTFrameGetLines(frame) as! [CTLine]
        guard let line = lines.last else { return 0 }
        var origin = CGPoint.zero
        var descent: CGFloat = 0
        CTFrameGetLineOrigins(frame, CFRange(location: lines.count - 1, length: 1), &origin)
        _ = CTLineGetTypographicBounds(line, nil, &descent, nil)
        return height - origin.y + descent
    }

    private func drawPage(_ context: CGContext) {
        let offset = surface.convert(CGPoint.zero, to: view)
        ViewOnceBackdrop.paint(context, in: view.bounds.offsetBy(dx: -offset.x, dy: -offset.y))
        let photo = page == 0 ? image : nil
        let height = photo == nil ? 0 : photoSize.height
        let range = ranges[page]
        let gap = photo != nil && range.length > 0 ? captionGap : 0
        let available = contentHeight - height - gap
        let frame = range.length > 0
            ? textFrame(CTFramesetterCreateWithAttributedString(attributed), range, height: available)
            : nil
        let textHeight = frame.map { usedHeight($0, height: available) } ?? 0
        let top = (laidOut.height - height - gap - textHeight) / 2
        if let photo {
            let rect = CGRect(x: (laidOut.width - photoSize.width) / 2, y: top, width: photoSize.width, height: height)
            context.saveGState()
            context.addPath(UIBezierPath(roundedRect: rect, cornerRadius: 14).cgPath)
            context.clip()
            photo.draw(in: rect)
            context.restoreGState()
        }
        if let frame {
            context.saveGState()
            context.translateBy(x: (laidOut.width - textWidth) / 2, y: top + height + gap + available)
            context.scaleBy(x: 1, y: -1)
            CTFrameDraw(frame, context)
            context.restoreGState()
        }
        let caption = (text as NSString).substring(with: NSRange(location: range.location, length: range.length))
        surface.accessibilityLabel = photo == nil ? caption : (caption.isEmpty ? "View-once image" : "View-once image. " + caption)
    }

    private func updateFooter(count: Int) {
        previous.isHidden = count < 2
        nextButton.isHidden = count < 2
        previous.isEnabled = page > 0
        nextButton.isEnabled = page + 1 < count
        if count > 1 {
            pageLabel.text = "\(page + 1) / \(count)"
        } else {
            let lock = NSTextAttachment()
            lock.image = UIImage(systemName: "lock")?.withTintColor(ViewOnceBackdrop.muted)
            lock.bounds = CGRect(x: 0, y: -2, width: 13, height: 13)
            let hint = NSMutableAttributedString(attachment: lock)
            hint.append(NSAttributedString(string: "  Available until you close."))
            pageLabel.attributedText = hint
        }
    }

    private func render() throws {
        guard !ranges.isEmpty else { throw NativeFailure.unavailable }
        let size = surface.bounds.size
        let format = UIGraphicsImageRendererFormat()
        format.scale = min(UIScreen.main.scale, 2)
        format.opaque = true
        let rendered = UIGraphicsImageRenderer(size: size, format: format).image { context in
            drawPage(context.cgContext)
        }
        guard let cg = rendered.cgImage else { throw NativeFailure.unavailable }
        var buffer: CVPixelBuffer?
        guard CVPixelBufferCreate(kCFAllocatorDefault, cg.width, cg.height, kCVPixelFormatType_32ARGB,
            [kCVPixelBufferCGImageCompatibilityKey: true, kCVPixelBufferCGBitmapContextCompatibilityKey: true] as CFDictionary,
            &buffer) == kCVReturnSuccess, let buffer else { throw NativeFailure.unavailable }
        CVPixelBufferLockBaseAddress(buffer, [])
        defer { CVPixelBufferUnlockBaseAddress(buffer, []) }
        guard let context = CGContext(data: CVPixelBufferGetBaseAddress(buffer), width: cg.width,
            height: cg.height, bitsPerComponent: 8, bytesPerRow: CVPixelBufferGetBytesPerRow(buffer),
            space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.noneSkipFirst.rawValue)
        else { throw NativeFailure.unavailable }
        context.draw(cg, in: CGRect(x: 0, y: 0, width: cg.width, height: cg.height))
        var description: CMVideoFormatDescription?
        guard CMVideoFormatDescriptionCreateForImageBuffer(allocator: kCFAllocatorDefault,
            imageBuffer: buffer, formatDescriptionOut: &description) == noErr, let description
        else { throw NativeFailure.unavailable }
        var timing = CMSampleTimingInfo(duration: .invalid, presentationTimeStamp: .zero, decodeTimeStamp: .invalid)
        var sample: CMSampleBuffer?
        guard CMSampleBufferCreateReadyWithImageBuffer(allocator: kCFAllocatorDefault, imageBuffer: buffer,
            formatDescription: description, sampleTiming: &timing, sampleBufferOut: &sample) == noErr,
            let sample else { throw NativeFailure.unavailable }
        if let attachments = CMSampleBufferGetSampleAttachmentsArray(sample, createIfNecessary: true) as? [NSMutableDictionary] {
            attachments.first?[kCMSampleAttachmentKey_DisplayImmediately] = true
        }
        layer.flushAndRemoveImage()
        layer.enqueue(sample)
        updateFooter(count: ranges.count)
    }
    @objc private func closePressed() { finished?() }
    @objc private func previousPage() { page = max(0, page-1); do { try render() } catch { finished?() } }
    @objc private func nextPage() { guard nextButton.isEnabled else { return }; page += 1; do { try render() } catch { finished?() } }
    func erase() {
        data.resetBytes(in: data.startIndex..<data.endIndex)
        data.removeAll(keepingCapacity: false)
        text = ""; image = nil; ranges.removeAll(); shown = false
        surface.accessibilityLabel = nil
        layer.flushAndRemoveImage()
    }
}

private final class ViewOnceBackdrop: UIView {
    static let base = UIColor(red: 14/255, green: 18/255, blue: 26/255, alpha: 1)
    static let ink = UIColor(red: 240/255, green: 244/255, blue: 1, alpha: 1)
    static let muted = UIColor(red: 173/255, green: 185/255, blue: 209/255, alpha: 1)
    static let accent = UIColor(red: 169/255, green: 195/255, blue: 1, alpha: 1)
    private static let glow = UIColor(red: 36/255, green: 51/255, blue: 84/255, alpha: 1)

    override init(frame: CGRect) {
        super.init(frame: frame)
        isOpaque = true
        contentMode = .redraw
    }
    required init?(coder: NSCoder) { return nil }
    override func draw(_ rect: CGRect) {
        if let context = UIGraphicsGetCurrentContext() { Self.paint(context, in: bounds) }
    }

    static func paint(_ context: CGContext, in bounds: CGRect) {
        context.setFillColor(base.cgColor)
        context.fill(bounds)
        guard let gradient = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(),
            colors: [glow.cgColor, base.cgColor] as CFArray, locations: [0, 1]) else { return }
        let center = CGPoint(x: bounds.midX, y: bounds.minY + bounds.height * 0.39)
        context.drawRadialGradient(gradient, startCenter: center, startRadius: 0, endCenter: center,
            endRadius: max(bounds.width, bounds.height) * 0.65, options: [.drawsAfterEndLocation])
    }
}
