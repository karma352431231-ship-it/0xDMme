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
        } else if mime == "video/mp4" || mime == "video/quicktime" {
            guard bytes > 0 else { throw NativeFailure.unavailable }
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
    private var motion: NativeViewOnceMotion?
    private var shown = false
    private var page = 0
    private var ranges: [CFRange] = []
    private var laidOut = CGSize.zero
    private var photoSize = CGSize.zero
    private let surface = UIView()
    private let layer = AVSampleBufferDisplayLayer()
    private let loading = UIActivityIndicatorView(style: .medium)
    private let playbackNotice = UILabel()
    private let header = UIView()
    private let footer = UIView()
    private let controls = ViewOncePlaybackControls()
    private var headerHeight: NSLayoutConstraint!
    private var footerHeight: NSLayoutConstraint!
    private var controlsHeight: NSLayoutConstraint!
    private var normalBottom: NSLayoutConstraint!
    private var expandedBottom: NSLayoutConstraint!
    private var fullscreen = false
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
    override var prefersStatusBarHidden: Bool { fullscreen }
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
        playbackNotice.text = "Could not play this media."
        playbackNotice.textColor = .white
        playbackNotice.isHidden = true
        playbackNotice.translatesAutoresizingMaskIntoConstraints = false
        surface.addSubview(playbackNotice)

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
        for element in [previous, pageLabel, nextButton] {
            element.translatesAutoresizingMaskIntoConstraints = false
            footer.addSubview(element)
        }
        updateFooter(count: 1)
        for control in [close, previous, nextButton] { control.tintColor = ViewOnceBackdrop.ink }
        controls.isHidden = true
        controls.toggle = { [weak self] in self?.motion?.toggle() }
        controls.seek = { [weak self] seconds in self?.motion?.seek(to: seconds) }
        controls.skip = { [weak self] seconds in self?.motion?.skip(seconds) }
        controls.expand = { [weak self] in self?.toggleFullscreen() }
        surface.addGestureRecognizer(UITapGestureRecognizer(target: self, action: #selector(toggleFullscreen)))
        for element in [header, surface, footer, controls] {
            element.translatesAutoresizingMaskIntoConstraints = false
            view.addSubview(element)
        }
        let safe = view.safeAreaLayoutGuide
        headerHeight = header.heightAnchor.constraint(equalToConstant: 56)
        footerHeight = footer.heightAnchor.constraint(equalToConstant: 48)
        controlsHeight = controls.heightAnchor.constraint(equalToConstant: 0)
        normalBottom = surface.bottomAnchor.constraint(equalTo: footer.topAnchor)
        expandedBottom = surface.bottomAnchor.constraint(equalTo: safe.bottomAnchor)
        NSLayoutConstraint.activate([
            header.topAnchor.constraint(equalTo: safe.topAnchor),
            header.leadingAnchor.constraint(equalTo: safe.leadingAnchor),
            header.trailingAnchor.constraint(equalTo: safe.trailingAnchor),
            headerHeight,
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
            normalBottom,
            loading.centerXAnchor.constraint(equalTo: surface.centerXAnchor),
            loading.centerYAnchor.constraint(equalTo: surface.centerYAnchor),
            playbackNotice.centerXAnchor.constraint(equalTo: surface.centerXAnchor),
            playbackNotice.centerYAnchor.constraint(equalTo: surface.centerYAnchor),
            footer.leadingAnchor.constraint(equalTo: safe.leadingAnchor),
            footer.trailingAnchor.constraint(equalTo: safe.trailingAnchor),
            footer.bottomAnchor.constraint(equalTo: controls.topAnchor),
            footerHeight,
            controls.leadingAnchor.constraint(equalTo: safe.leadingAnchor),
            controls.trailingAnchor.constraint(equalTo: safe.trailingAnchor),
            controls.bottomAnchor.constraint(equalTo: safe.bottomAnchor),
            controlsHeight,
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
        if mime == "video/mp4" || mime == "video/quicktime" {
            motion = NativeViewOnceMotion(video: data, mime: mime)
        } else if mime != "text/plain" {
            guard let source = CGImageSourceCreateWithData(data as CFData, nil) else {
                throw NativeFailure.unavailable
            }
            if (mime == "image/gif" || mime == "image/webp"), CGImageSourceGetCount(source) > 1 {
                motion = try NativeViewOnceMotion(image: source, bytes: data)
            } else {
                guard let cg = CGImageSourceCreateThumbnailAtIndex(source, 0, [
                    kCGImageSourceCreateThumbnailFromImageAlways: true,
                    kCGImageSourceCreateThumbnailWithTransform: true,
                    kCGImageSourceThumbnailMaxPixelSize: 3072
                ] as CFDictionary) else { throw NativeFailure.unavailable }
                image = UIImage(cgImage: cg)
            }
        }
        if motion == nil { data.resetBytes(in: data.startIndex..<data.endIndex) }
        data = Data() // The motion owner clears its buffer when the viewer closes.
        if let motion {
            surface.layer.insertSublayer(motion.container, above: layer)
            motion.resized = { [weak self] in self?.resizeMedia() }
            motion.playback = { [weak self] playing in self?.updatePlayback(playing) }
            motion.progress = { [weak self] position, duration in self?.controls.update(position, duration) }
            motion.failure = { [weak self] in self?.showPlaybackError() }
            controls.isHidden = !motion.isVideo
            controlsHeight.constant = motion.isVideo ? 84 : 0
        }
        shown = true
        view.layoutIfNeeded()
        try paginate()
        try render()
        loading.stopAnimating()
        motion?.start()
    }
    private var hasMedia: Bool { image != nil || motion != nil }

    private func resizeMedia() {
        do { try paginate(); try render() } catch { showPlaybackError() }
    }

    private func updatePlayback(_ playing: Bool) {
        controls.playing(playing)
    }

    @objc private func toggleFullscreen() {
        guard motion?.isVideo == true, shown else { return }
        fullscreen.toggle()
        header.isHidden = fullscreen
        footer.isHidden = fullscreen
        headerHeight.constant = fullscreen ? 0 : 56
        footerHeight.constant = fullscreen ? 0 : 48
        NSLayoutConstraint.deactivate([normalBottom, expandedBottom])
        NSLayoutConstraint.activate([fullscreen ? expandedBottom : normalBottom])
        controls.fullscreen(fullscreen)
        motion?.container.cornerRadius = fullscreen ? 0 : 14
        setNeedsStatusBarAppearanceUpdate()
        view.layoutIfNeeded()
        resizeMedia()
    }

    private func showPlaybackError() {
        erase()
        playbackNotice.isHidden = false
        surface.accessibilityLabel = playbackNotice.text
        updateFooter(count: 1)
    }

    private var attributed: NSAttributedString {
        let paragraph = NSMutableParagraphStyle()
        paragraph.alignment = .center
        paragraph.lineSpacing = 3
        return NSAttributedString(string: text, attributes: [
            .font: UIFont.systemFont(ofSize: hasMedia ? 16 : 22),
            .foregroundColor: UIColor.white,
            .paragraphStyle: paragraph
        ])
    }
    private var textWidth: CGFloat { min(laidOut.width - 32, hasMedia ? 540 : 360) }
    private var contentHeight: CGFloat { laidOut.height - (motion?.isVideo == true ? 0 : 24) }
    private var captionGap: CGFloat { text.isEmpty || fullscreen ? 0 : 10 }

    private func textFrame(_ setter: CTFramesetter, _ range: CFRange, height: CGFloat) -> CTFrame {
        let path = CGPath(rect: CGRect(x: 0, y: 0, width: textWidth, height: height), transform: nil)
        return CTFramesetterCreateFrame(setter, range, path, nil)
    }

    private func paginate() throws {
        laidOut = surface.bounds.size
        guard laidOut.width > 40, laidOut.height > 40 else { throw NativeFailure.unavailable }
        let message = fullscreen ? NSAttributedString(string: "") : attributed
        let setter = CTFramesetterCreateWithAttributedString(message)
        ranges.removeAll()
        var location = 0
        if let mediaSize = image?.size ?? motion?.size {
            let height = contentHeight * (text.isEmpty || fullscreen ? 1 : 0.72)
            let width = motion?.isVideo == true ? laidOut.width : min(laidOut.width - 32, 680)
            let scale = min(width / mediaSize.width, height / mediaSize.height)
            photoSize = CGSize(width: mediaSize.width * scale, height: mediaSize.height * scale)
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
        let mediaVisible = page == 0 && hasMedia
        let height = mediaVisible ? photoSize.height : 0
        let range = ranges[page]
        let gap = mediaVisible && range.length > 0 ? captionGap : 0
        let available = contentHeight - height - gap
        let frame = range.length > 0
            ? textFrame(CTFramesetterCreateWithAttributedString(attributed), range, height: available)
            : nil
        let textHeight = frame.map { usedHeight($0, height: available) } ?? 0
        let top = (laidOut.height - height - gap - textHeight) / 2
        let rect = CGRect(x: (laidOut.width - photoSize.width) / 2, y: top, width: photoSize.width, height: height)
        motion?.position(mediaVisible ? rect : nil)
        if let photo = image, mediaVisible {
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
        if mediaVisible {
            let label = motion?.isVideo == true ? "View-once video" : "View-once image"
            surface.accessibilityLabel = caption.isEmpty ? label : label + ". " + caption
        } else { surface.accessibilityLabel = caption }
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
        let sample = try viewOnceSample(viewOncePixels(cg))
        layer.flushAndRemoveImage()
        layer.enqueue(sample)
        updateFooter(count: ranges.count)
    }
    @objc private func closePressed() { finished?() }
    @objc private func previousPage() { page = max(0, page-1); do { try render() } catch { finished?() } }
    @objc private func nextPage() { guard nextButton.isEnabled else { return }; page += 1; do { try render() } catch { finished?() } }
    func erase() {
        motion?.erase()
        motion = nil
        controls.isHidden = true
        loading.stopAnimating()
        playbackNotice.isHidden = true
        data.resetBytes(in: data.startIndex..<data.endIndex)
        data.removeAll(keepingCapacity: false)
        text = ""; image = nil; ranges.removeAll(); shown = false
        surface.accessibilityLabel = nil
        layer.flushAndRemoveImage()
    }
}

private final class ViewOncePlaybackControls: UIView {
    private let timeline = UISlider()
    private let time = UILabel()
    private let play = UIButton(type: .system)
    private let expandButton = UIButton(type: .system)
    private var scrubbing = false
    var toggle: (() -> Void)?
    var seek: ((Double) -> Void)?
    var skip: ((Double) -> Void)?
    var expand: (() -> Void)?

    override init(frame: CGRect = .zero) {
        super.init(frame: frame)
        backgroundColor = ViewOnceBackdrop.base.withAlphaComponent(0.9)
        clipsToBounds = true
        timeline.minimumValue = 0
        timeline.maximumValue = 1
        timeline.isEnabled = false
        timeline.accessibilityLabel = "Video position"
        timeline.addTarget(self, action: #selector(startScrubbing), for: .touchDown)
        timeline.addTarget(self, action: #selector(scrub), for: .valueChanged)
        timeline.addTarget(self, action: #selector(finishScrubbing), for: [.touchUpInside, .touchUpOutside, .touchCancel])
        time.text = "0:00 / 0:00"
        time.font = .monospacedDigitSystemFont(ofSize: 12, weight: .regular)
        time.textColor = .white
        time.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        let back = button("gobackward.10", "Back 10 seconds", #selector(backward))
        let forward = button("goforward.10", "Forward 10 seconds", #selector(forward))
        configure(play, "play.fill", "Play video", #selector(playPressed))
        play.isEnabled = false
        configure(expandButton, "arrow.up.left.and.arrow.down.right", "Full screen", #selector(expandPressed))
        let row = UIStackView(arrangedSubviews: [time, back, play, forward, expandButton])
        row.alignment = .center
        for element in [timeline, row] {
            element.translatesAutoresizingMaskIntoConstraints = false
            addSubview(element)
        }
        NSLayoutConstraint.activate([
            timeline.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 12),
            timeline.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -12),
            timeline.topAnchor.constraint(equalTo: topAnchor, constant: 4),
            timeline.heightAnchor.constraint(equalToConstant: 32),
            row.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 12),
            row.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -8),
            row.topAnchor.constraint(equalTo: timeline.bottomAnchor),
            row.heightAnchor.constraint(equalToConstant: 44)
        ])
    }
    required init?(coder: NSCoder) { return nil }

    private func button(_ image: String, _ label: String, _ action: Selector) -> UIButton {
        let control = UIButton(type: .system)
        configure(control, image, label, action)
        return control
    }
    private func configure(_ control: UIButton, _ image: String, _ label: String, _ action: Selector) {
        control.setImage(UIImage(systemName: image), for: .normal)
        control.tintColor = .white
        control.accessibilityLabel = label
        control.addTarget(self, action: action, for: .touchUpInside)
        control.widthAnchor.constraint(equalToConstant: 44).isActive = true
        control.heightAnchor.constraint(equalToConstant: 44).isActive = true
    }
    func update(_ position: Double, _ duration: Double) {
        timeline.isEnabled = duration > 0
        timeline.maximumValue = Float(max(1, duration))
        if !scrubbing {
            timeline.value = Float(position)
            time.text = Self.format(position) + " / " + Self.format(duration)
        }
    }
    func playing(_ active: Bool) {
        play.isEnabled = true
        play.setImage(UIImage(systemName: active ? "pause.fill" : "play.fill"), for: .normal)
        play.accessibilityLabel = active ? "Pause video" : "Play video"
    }
    func fullscreen(_ active: Bool) {
        expandButton.setImage(UIImage(systemName: active ? "arrow.down.right.and.arrow.up.left" : "arrow.up.left.and.arrow.down.right"), for: .normal)
        expandButton.accessibilityLabel = active ? "Exit full screen" : "Full screen"
    }
    @objc private func startScrubbing() { scrubbing = true }
    @objc private func scrub() {
        time.text = Self.format(Double(timeline.value)) + " / " + Self.format(Double(timeline.maximumValue))
    }
    @objc private func finishScrubbing() { scrubbing = false; seek?(Double(timeline.value)) }
    @objc private func backward() { skip?(-10) }
    @objc private func forward() { skip?(10) }
    @objc private func playPressed() { toggle?() }
    @objc private func expandPressed() { expand?() }
    private static func format(_ seconds: Double) -> String {
        let value = max(0, Int(seconds))
        return String(format: "%d:%02d", value / 60, value % 60)
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
