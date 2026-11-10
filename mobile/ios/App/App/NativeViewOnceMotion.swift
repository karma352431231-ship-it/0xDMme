import AVFoundation
import ImageIO
import UIKit
import UniformTypeIdentifiers

/** AVFoundation reads only this memory-backed URL and never receives a file path. */
private final class ViewOnceVideoBytes: NSObject, AVAssetResourceLoaderDelegate {
    private var data: Data
    private let type: UTType
    let url: URL

    init(_ bytes: Data, mime: String) {
        data = bytes
        type = mime == "video/quicktime" ? .quickTimeMovie : .mpeg4Movie
        url = URL(string: "view-once://local/video." + (mime == "video/quicktime" ? "mov" : "mp4"))!
    }

    func resourceLoader(_ resourceLoader: AVAssetResourceLoader,
        shouldWaitForLoadingOfRequestedResource request: AVAssetResourceLoadingRequest) -> Bool {
        guard request.request.url == url, !data.isEmpty else { return false }
        if let info = request.contentInformationRequest {
            if let allowed = info.allowedContentTypes, !allowed.isEmpty, !allowed.contains(type.identifier) {
                request.finishLoading(with: NativeFailure.unavailable)
                return true
            }
            info.contentType = type.identifier
            info.contentLength = Int64(data.count)
            info.isByteRangeAccessSupported = true
        }
        if let part = request.dataRequest {
            let offset = max(part.requestedOffset, part.currentOffset)
            guard part.requestedOffset >= 0, offset <= data.count, part.requestedLength >= 0 else {
                request.finishLoading(with: NativeFailure.unavailable)
                return true
            }
            let start = Int(offset)
            let remaining = data.count - start
            let served = start - Int(part.requestedOffset)
            let amount = part.requestsAllDataToEndOfResource ? remaining : min(remaining, max(0, part.requestedLength - served))
            if amount > 0 { part.respond(with: data.subdata(in: start..<(start + amount))) }
        }
        request.finishLoading()
        return true
    }

    func erase() {
        data.resetBytes(in: data.startIndex..<data.endIndex)
        data.removeAll(keepingCapacity: false)
    }
}

/** Both GIF and video frames go straight to a capture-protected display layer. */
final class NativeViewOnceMotion: NSObject {
    let container = CALayer()
    private let frames = AVSampleBufferDisplayLayer()
    private var clock: CADisplayLink?
    private var imageSource: CGImageSource?
    private var imageBytes = Data()
    private var imageIndex = 0
    private var nextFrame = 0.0
    private var videoSource: ViewOnceVideoBytes?
    private var asset: AVURLAsset?
    private var preparation: Task<Void, Never>?
    private var player: AVPlayer?
    private var output: AVPlayerItemVideoOutput?
    private var status: NSKeyValueObservation?
    private var completion: NSObjectProtocol?
    private var finished = false
    private var transform = CGAffineTransform.identity
    private var trackSize = CGSize(width: 16, height: 9)
    private(set) var size = CGSize(width: 16, height: 9)
    let isVideo: Bool
    var resized: (() -> Void)?
    var playback: ((Bool) -> Void)?
    var failure: (() -> Void)?

    init(image: CGImageSource, bytes: Data) throws {
        let count = CGImageSourceGetCount(image)
        guard count > 1, count <= 500,
              let props = CGImageSourceCopyPropertiesAtIndex(image, 0, nil) as? [CFString: Any],
              let width = props[kCGImagePropertyPixelWidth] as? Int,
              let height = props[kCGImagePropertyPixelHeight] as? Int,
              width > 0, height > 0, Double(width) * Double(height) <= 8_000_000 else {
            throw NativeFailure.unavailable
        }
        imageSource = image
        imageBytes = bytes
        size = CGSize(width: width, height: height)
        trackSize = size
        isVideo = false
        super.init()
        configureLayers()
    }

    init(video: Data, mime: String) {
        videoSource = ViewOnceVideoBytes(video, mime: mime)
        isVideo = true
        super.init()
        configureLayers()
    }

    private func configureLayers() {
        container.cornerRadius = 14
        container.masksToBounds = true
        frames.preventsCapture = true
        frames.videoGravity = .resizeAspect
        container.addSublayer(frames)
    }

    func position(_ rect: CGRect?) {
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        container.isHidden = rect == nil
        if let rect {
            container.frame = rect
            let scale = min(rect.width / size.width, rect.height / size.height)
            frames.bounds = CGRect(x: 0, y: 0, width: trackSize.width * scale, height: trackSize.height * scale)
            frames.position = CGPoint(x: container.bounds.midX, y: container.bounds.midY)
            frames.setAffineTransform(transform)
        }
        CATransaction.commit()
    }

    func start() {
        let timer = CADisplayLink(target: self, selector: #selector(tick))
        timer.add(to: .main, forMode: .common)
        clock = timer
        if let videoSource {
            let video = AVURLAsset(url: videoSource.url, options: [
                AVURLAssetReferenceRestrictionsKey: AVAssetReferenceRestrictions.forbidAll.rawValue
            ])
            video.resourceLoader.setDelegate(videoSource, queue: .main)
            asset = video
            preparation = Task { @MainActor [weak self] in await self?.prepare(video) }
        }
    }

    @MainActor private func prepare(_ video: AVURLAsset) async {
        do {
            guard let track = try await video.loadTracks(withMediaType: .video).first else {
                throw NativeFailure.unavailable
            }
            let naturalSize = try await track.load(.naturalSize)
            let rotation = try await track.load(.preferredTransform)
            try Task.checkCancellation()
            let box = CGRect(origin: .zero, size: naturalSize).applying(rotation)
            guard box.width.isFinite, box.height.isFinite, box.width > 0, box.height > 0,
                  box.width * box.height <= 8_400_000 else { throw NativeFailure.unavailable }
            trackSize = naturalSize
            size = box.size
            transform = CGAffineTransform(a: rotation.a, b: rotation.b, c: rotation.c, d: rotation.d, tx: 0, ty: 0)
            resized?()
            try Task.checkCancellation()

            let item = AVPlayerItem(asset: video)
            let port = AVPlayerItemVideoOutput(outputSettings: [
                kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA
            ])
            item.add(port)
            output = port
            let player = AVPlayer(playerItem: item)
            self.player = player
            player.automaticallyWaitsToMinimizeStalling = false
            player.isMuted = UIScreen.main.isCaptured
            status = item.observe(\.status, options: [.initial, .new]) { [weak self] item, _ in
                let failed = item.status == .failed
                if failed {
                    DispatchQueue.main.async { [weak self] in self?.failure?() }
                }
            }
            completion = NotificationCenter.default.addObserver(forName: .AVPlayerItemDidPlayToEndTime,
                object: item, queue: .main) { [weak self] _ in
                self?.finished = true
                self?.playback?(false)
            }
            player.play()
            playback?(true)
        } catch {
            if !Task.isCancelled { failure?() }
        }
    }

    func toggle() {
        guard let player else { return }
        if player.rate > 0 && !finished {
            player.pause()
            playback?(false)
        } else {
            if finished { player.seek(to: .zero) }
            finished = false
            player.play()
            playback?(true)
        }
    }

    @objc private func tick(_ link: CADisplayLink) {
        player?.isMuted = UIScreen.main.isCaptured
        guard !container.isHidden, frames.isReadyForMoreMediaData else { return }
        do {
            if let imageSource {
                if link.timestamp < nextFrame { return }
                let index = imageIndex
                guard let image = CGImageSourceCreateThumbnailAtIndex(imageSource, index, [
                    kCGImageSourceCreateThumbnailFromImageAlways: true,
                    kCGImageSourceThumbnailMaxPixelSize: 1536
                ] as CFDictionary) else { throw NativeFailure.unavailable }
                frames.enqueue(try viewOnceSample(viewOncePixels(image)))
                imageIndex = (index + 1) % CGImageSourceGetCount(imageSource)
                nextFrame = link.timestamp + frameDelay(imageSource, index)
            } else if let output {
                let time = output.itemTime(forHostTime: link.targetTimestamp)
                if time.isNumeric, output.hasNewPixelBuffer(forItemTime: time),
                   let pixels = output.copyPixelBuffer(forItemTime: time, itemTimeForDisplay: nil) {
                    frames.enqueue(try viewOnceSample(pixels, at: time))
                }
            }
        } catch { failure?() }
    }

    private func frameDelay(_ source: CGImageSource, _ index: Int) -> Double {
        let properties = CGImageSourceCopyPropertiesAtIndex(source, index, nil) as? [CFString: Any]
        let gif = properties?[kCGImagePropertyGIFDictionary] as? [CFString: Double]
        let webp = properties?[kCGImagePropertyWebPDictionary] as? [CFString: Double]
        let delay = gif?[kCGImagePropertyGIFUnclampedDelayTime] ?? gif?[kCGImagePropertyGIFDelayTime]
            ?? webp?[kCGImagePropertyWebPUnclampedDelayTime] ?? webp?[kCGImagePropertyWebPDelayTime] ?? 0.1
        return delay >= 0.02 ? min(delay, 10) : 0.1
    }

    func erase() {
        clock?.invalidate()
        clock = nil
        preparation?.cancel()
        preparation = nil
        status?.invalidate()
        status = nil
        if let completion { NotificationCenter.default.removeObserver(completion) }
        completion = nil
        player?.pause()
        player?.replaceCurrentItem(with: nil)
        player = nil
        output = nil
        asset?.cancelLoading()
        asset = nil
        videoSource?.erase()
        videoSource = nil
        imageSource = nil
        imageBytes.resetBytes(in: imageBytes.startIndex..<imageBytes.endIndex)
        imageBytes.removeAll(keepingCapacity: false)
        frames.flushAndRemoveImage()
        container.removeFromSuperlayer()
        failure = nil; resized = nil; playback = nil
    }
}

func viewOncePixels(_ image: CGImage) throws -> CVPixelBuffer {
    var buffer: CVPixelBuffer?
    guard CVPixelBufferCreate(kCFAllocatorDefault, image.width, image.height, kCVPixelFormatType_32ARGB,
        [kCVPixelBufferCGImageCompatibilityKey: true, kCVPixelBufferCGBitmapContextCompatibilityKey: true] as CFDictionary,
        &buffer) == kCVReturnSuccess, let buffer else { throw NativeFailure.unavailable }
    CVPixelBufferLockBaseAddress(buffer, [])
    defer { CVPixelBufferUnlockBaseAddress(buffer, []) }
    guard let context = CGContext(data: CVPixelBufferGetBaseAddress(buffer), width: image.width,
        height: image.height, bitsPerComponent: 8, bytesPerRow: CVPixelBufferGetBytesPerRow(buffer),
        space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.noneSkipFirst.rawValue)
    else { throw NativeFailure.unavailable }
    context.draw(image, in: CGRect(x: 0, y: 0, width: image.width, height: image.height))
    return buffer
}

func viewOnceSample(_ buffer: CVPixelBuffer, at time: CMTime = .zero) throws -> CMSampleBuffer {
    var description: CMVideoFormatDescription?
    guard CMVideoFormatDescriptionCreateForImageBuffer(allocator: kCFAllocatorDefault,
        imageBuffer: buffer, formatDescriptionOut: &description) == noErr, let description
    else { throw NativeFailure.unavailable }
    var timing = CMSampleTimingInfo(duration: .invalid, presentationTimeStamp: time, decodeTimeStamp: .invalid)
    var sample: CMSampleBuffer?
    guard CMSampleBufferCreateReadyWithImageBuffer(allocator: kCFAllocatorDefault, imageBuffer: buffer,
        formatDescription: description, sampleTiming: &timing, sampleBufferOut: &sample) == noErr,
        let sample else { throw NativeFailure.unavailable }
    if let attachments = CMSampleBufferGetSampleAttachmentsArray(sample, createIfNecessary: true) as? [NSMutableDictionary] {
        attachments.first?[kCMSampleAttachmentKey_DisplayImmediately] = true
    }
    return sample
}
