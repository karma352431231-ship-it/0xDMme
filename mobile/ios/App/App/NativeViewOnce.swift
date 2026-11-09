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
    private let surface = UIView()
    private let layer = AVSampleBufferDisplayLayer()
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
    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black
        layer.preventsCapture = true
        layer.videoGravity = .resizeAspect
        surface.backgroundColor = .black
        surface.clipsToBounds = true
        surface.layer.addSublayer(layer)
        surface.isAccessibilityElement = true
        surface.accessibilityLabel = "Loading view-once message"
        let close = UIButton(type: .system)
        close.setImage(UIImage(systemName: "xmark"), for: .normal)
        close.accessibilityLabel = "Close view-once message"
        close.addTarget(self, action: #selector(closePressed), for: .touchUpInside)
        previous.isEnabled = false
        nextButton.isEnabled = false
        previous.setImage(UIImage(systemName: "chevron.left"), for: .normal)
        previous.accessibilityLabel = "Previous page"
        previous.addTarget(self, action: #selector(previousPage), for: .touchUpInside)
        nextButton.setImage(UIImage(systemName: "chevron.right"), for: .normal)
        nextButton.accessibilityLabel = "Next page"
        nextButton.addTarget(self, action: #selector(nextPage), for: .touchUpInside)
        pageLabel.textColor = .white
        pageLabel.textAlignment = .center
        let footer = UIStackView(arrangedSubviews: [previous, pageLabel, nextButton])
        footer.axis = .horizontal; footer.distribution = .fillEqually
        for control in [close, previous, nextButton] { control.tintColor = .white }
        for element in [close, surface, footer] {
            element.translatesAutoresizingMaskIntoConstraints = false
            view.addSubview(element)
        }
        NSLayoutConstraint.activate([
            close.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            close.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor, constant: -8),
            close.widthAnchor.constraint(equalToConstant: 44), close.heightAnchor.constraint(equalToConstant: 44),
            surface.topAnchor.constraint(equalTo: close.bottomAnchor),
            surface.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            surface.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            surface.bottomAnchor.constraint(equalTo: footer.topAnchor),
            footer.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor),
            footer.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor),
            footer.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor),
            footer.heightAnchor.constraint(equalToConstant: 44)
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
    }
    private var attributed: NSAttributedString {
        NSAttributedString(string: text, attributes: [
            .font: UIFont.systemFont(ofSize: 18), .foregroundColor: UIColor.white
        ])
    }
    private func paginate() throws {
        laidOut = surface.bounds.size
        guard laidOut.width > 40, laidOut.height > 40 else { throw NativeFailure.unavailable }
        let setter = CTFramesetterCreateWithAttributedString(attributed)
        let path = CGPath(rect: surface.bounds.insetBy(dx: 20, dy: 20), transform: nil)
        ranges.removeAll()
        var location = 0
        while location < attributed.length {
            let frame = CTFramesetterCreateFrame(setter, CFRange(location: location, length: 0), path, nil)
            let visible = CTFrameGetVisibleStringRange(frame)
            guard visible.length > 0 else { throw NativeFailure.unavailable }
            ranges.append(visible); location += visible.length
        }
        page = min(page, max(0, ranges.count + (image == nil ? 0 : 1) - 1))
    }
    private func render() throws {
        let count = ranges.count + (image == nil ? 0 : 1)
        guard count > 0 else { throw NativeFailure.unavailable }
        let size = surface.bounds.size
        let format = UIGraphicsImageRendererFormat()
        format.scale = min(UIScreen.main.scale, 2)
        format.opaque = true
        let rendered = UIGraphicsImageRenderer(size: size, format: format).image { context in
            UIColor.black.setFill(); context.fill(CGRect(origin: .zero, size: size))
            if let image, page == 0 {
                let scale = min(size.width / image.size.width, size.height / image.size.height)
                let rect = CGRect(x: (size.width-image.size.width*scale)/2,
                    y: (size.height-image.size.height*scale)/2,
                    width: image.size.width*scale, height: image.size.height*scale)
                image.draw(in: rect)
                surface.accessibilityLabel = "View-once image"
            } else {
                let range = ranges[page - (image == nil ? 0 : 1)]
                let frame = CTFramesetterCreateFrame(CTFramesetterCreateWithAttributedString(attributed),
                    range, CGPath(rect: surface.bounds.insetBy(dx: 20, dy: 20), transform: nil), nil)
                context.cgContext.translateBy(x: 0, y: size.height)
                context.cgContext.scaleBy(x: 1, y: -1)
                CTFrameDraw(frame, context.cgContext)
                surface.accessibilityLabel = (text as NSString).substring(with: NSRange(location: range.location, length: range.length))
            }
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
        previous.isEnabled = page > 0
        nextButton.isEnabled = page + 1 < count
        pageLabel.text = "\(page + 1) / \(count)"
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
