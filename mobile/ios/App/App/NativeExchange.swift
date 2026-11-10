import Foundation

/** Serial-queue confined streaming body and URLSession task. No cookie access.
 * A suspended task retains at most 256 KiB of delivered application data; burst
 * overflow fails explicitly. Reads demand at most 32 KiB (live streams 4 KiB).
 */
final class NativeExchange {
    typealias Reply = (Result<Any, Error>) -> Void
    let request: NativePolicy.Request
    let task: URLSessionDataTask
    private(set) var response: NativeResponse?
    private var buffer = Data()
    private var offset = 0
    private var total = 0
    private var ended = false
    private var suspended = false
    private var closed = false
    private var reader: (Int, Reply)?
    var hasReader: Bool { reader != nil }

    init(_ request: NativePolicy.Request, task: URLSessionDataTask) {
        self.request = request
        self.task = task
    }

    func accept(_ response: NativeResponse) throws {
        guard !closed, self.response == nil else { throw NativeFailure.unavailable }
        self.response = response
        suspend()
    }

    func append(_ bytes: Data) throws {
        guard !closed, !ended, let response else { throw NativeFailure.unavailable }
        guard bytes.count <= 256 * 1024 - (buffer.count - offset),
              bytes.count <= Int.max - total else { throw NativeFailure.unavailable }
        total += bytes.count
        guard (response.live || total <= NativePolicy.responseBytes),
              response.expected.map({ total <= $0 }) ?? true else { throw NativeFailure.unavailable }
        // Compact before appending, so already consumed chunks are not retained.
        if offset > 0 { buffer = Data(buffer.dropFirst(offset)); offset = 0 }
        buffer.append(bytes)
        suspend()
        deliver()
    }

    func complete(_ error: Error?) throws {
        guard !closed, let response else { throw NativeFailure.unavailable }
        if let error { throw error }
        guard response.expected.map({ total == $0 }) ?? true else { throw NativeFailure.unavailable }
        ended = true
        deliver()
    }

    func read(_ bytes: Int, reply: @escaping Reply) throws {
        guard !closed, reader == nil, let response, bytes >= 1,
              bytes <= (response.live ? 4096 : NativePolicy.chunkBytes) else { throw NativeFailure.unavailable }
        reader = (bytes, reply)
        deliver()
    }

    private func deliver() {
        guard let (maximum, reply) = reader else { return }
        let remaining = buffer.count - offset
        let complete = ended || (response?.expected.map { total == $0 } ?? false)
        // Coalesce finite responses inside the native owner. Returning each
        // small URLSession fragment makes large media pay a bridge round trip
        // per fragment. Streaming events retain their immediate delivery.
        if remaining > 0 && (response?.live == true || remaining >= maximum || complete) {
            let count = min(remaining, maximum)
            let bytes = buffer.subdata(in: offset..<(offset + count))
            offset += count
            if offset == buffer.count { buffer.removeAll(keepingCapacity: false); offset = 0 }
            reader = nil
            reply(.success(["done": complete && count == remaining, "data": bytes.base64EncodedString()]))
        } else if complete && remaining == 0 {
            reader = nil
            reply(.success(["done": true, "data": ""]))
        } else if suspended {
            suspended = false
            task.resume()
        }
    }

    private func suspend() {
        if !suspended { suspended = true; task.suspend() }
    }

    func close() {
        if closed { return }
        closed = true
        task.cancel()
        buffer.removeAll(keepingCapacity: false)
        offset = 0
        let pending = reader
        reader = nil
        pending?.1(.failure(NativeFailure.unavailable))
    }
}
