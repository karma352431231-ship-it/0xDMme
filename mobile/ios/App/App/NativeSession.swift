import Foundation
import Security

/** Owns native admission, deadlines, cookie commits and HTTP task disposal.
 * All mutable HTTP state is confined to one serial queue, including delegates.
 */
final class NativeSession: NSObject, URLSessionDataDelegate {
    typealias Reply = NativeExchange.Reply
    private final class Entry {
        let id: String
        let exchange: NativeExchange
        let ticket: NativeCookies.Ticket
        let bodyBytes: Int
        let timer: DispatchSourceTimer
        var head: Reply?
        var deadline: UInt64 = 0
        init(_ request: NativePolicy.Request, _ exchange: NativeExchange, _ ticket: NativeCookies.Ticket, _ timer: DispatchSourceTimer, _ head: @escaping Reply) {
            id = request.id; self.exchange = exchange; self.ticket = ticket
            bodyBytes = request.body?.count ?? 0; self.timer = timer; self.head = head
        }
    }
    private let queue = DispatchQueue(label: "app.zeroxdmme.native-session")
    private let configuration: NativeConnectionConfiguration
    private var cookies: NativeCookies?
    private var initializationFailed = false
    private var entries: [String: Entry] = [:]
    private var tasks: [Int: String] = [:]
    private var cancelled: [String: UInt64] = [:]
    private var completed: [String: UInt64] = [:]
    private var bodyBytes = 0
    private var closed = false
    private var protectedView = false
    private var session: URLSession!

    init(_ configuration: NativeConnectionConfiguration) {
        self.configuration = configuration
        super.init()
        let config = URLSessionConfiguration.ephemeral
        config.httpCookieStorage = nil
        config.httpShouldSetCookies = false
        config.urlCache = nil
        config.urlCredentialStorage = nil
        config.requestCachePolicy = .reloadIgnoringLocalCacheData
        config.timeoutIntervalForRequest = 15
        config.timeoutIntervalForResource = 7 * 24 * 60 * 60
        config.httpMaximumConnectionsPerHost = 8
        let delegates = OperationQueue()
        delegates.maxConcurrentOperationCount = 1
        delegates.underlyingQueue = queue
        session = URLSession(configuration: config, delegate: self, delegateQueue: delegates)
        // Opening protected custody gates foreground app use. Keep the blocking
        // Keychain work off the main thread, with user-initiated scheduling.
        DispatchQueue.global(qos: .userInitiated).async { [self] in
            let result = Result { try NativeCookieRegistry.open() }
            queue.async { [self] in
                if closed { return }
                switch result {
                case .success(let owner): cookies = owner
                case .failure: initializationFailed = true
                }
            }
        }
    }

    func protectView(_ active: Bool) { queue.sync { protectedView = active } }

    func ready(_ reply: @escaping Reply) {
        queue.async { [self] in
            if closed || initializationFailed { reply(.failure(NativeFailure.unavailable)) }
            else { reply(.success(cookies != nil)) }
        }
    }

    func open(_ input: [String: Any], reply: @escaping Reply) {
        queue.async { [self] in
            do {
                guard !closed, let cookies else { throw NativeFailure.unavailable }
                let policy = try NativePolicy.Request(input)
                prune()
                let size = policy.body?.count ?? 0
                guard entries.count < 8, entries[policy.id] == nil, cancelled[policy.id] == nil,
                      bodyBytes + size <= 16_800_000,
                      let url = URL(string: policy.path, relativeTo: configuration.destination)?.absoluteURL,
                      url.scheme == "https", url.host == configuration.destination.host,
                      url.port == configuration.destination.port else { throw NativeFailure.unavailable }
                let ticket = try cookies.reserve(policy.credentials ? policy.path : "")
                var request = URLRequest(url: url)
                request.httpMethod = policy.method
                request.httpShouldHandleCookies = false
                request.setValue(NativePolicy.service, forHTTPHeaderField: "Origin")
                request.setValue("identity", forHTTPHeaderField: "Accept-Encoding")
                if protectedView && policy.path == "/api/account/messages/view-once-open" {
                    request.setValue("1", forHTTPHeaderField: "Sec-0xdmme-Installed-View")
                }
                #if DEBUG && MOBILE_SYNTHETIC_TEST
                if let token = configuration.testAdmission {
                    request.setValue(token, forHTTPHeaderField: "x-0xdmme-synthetic-admission")
                }
                #endif
                for (name, value) in policy.headers { request.setValue(value, forHTTPHeaderField: name) }
                if policy.credentials {
                    let value = try cookies.header()
                    if !value.isEmpty { request.setValue(value, forHTTPHeaderField: "Cookie") }
                }
                request.httpBody = policy.body
                let task = session.dataTask(with: request)
                let exchange = NativeExchange(policy, task: task)
                let timer = DispatchSource.makeTimerSource(queue: queue)
                let entry = Entry(policy, exchange, ticket, timer, reply)
                entries[policy.id] = entry; tasks[task.taskIdentifier] = policy.id; bodyBytes += size
                timer.setEventHandler { [weak self, weak entry] in
                    guard let self, let entry, self.entries[entry.id] === entry,
                          DispatchTime.now().uptimeNanoseconds >= entry.deadline else { return }
                    self.abandon(entry)
                }
                deadline(entry, seconds: 15)
                timer.resume()
                task.resume()
            } catch { reply(.failure(NativeFailure.unavailable)) }
        }
    }

    func read(_ input: [String: Any], reply: @escaping Reply) {
        queue.async { [self] in
            do {
                try NativePolicy.keys(input, ["id", "bytes"])
                let id = try NativePolicy.id(input["id"])
                let bytes = try NativePolicy.integer(input["bytes"], minimum: 1, maximum: NativePolicy.chunkBytes)
                guard let entry = entries[id], current(entry), entry.head == nil,
                      !entry.exchange.hasReader else { throw NativeFailure.unavailable }
                deadline(entry, seconds: 15)
                try entry.exchange.read(bytes) { [weak self, weak entry] result in
                    guard let self, let entry, self.current(entry) else { reply(.failure(NativeFailure.unavailable)); return }
                    switch result {
                    case .failure:
                        self.abandon(entry)
                        reply(.failure(NativeFailure.unavailable))
                    case .success(let value):
                        guard let chunk = value as? [String: Any], let done = chunk["done"] as? Bool else {
                            self.abandon(entry); reply(.failure(NativeFailure.unavailable)); return
                        }
                        if done { self.finish(entry) } else { self.deadline(entry, seconds: 30) }
                        reply(.success(value))
                    }
                }
            } catch { reply(.failure(NativeFailure.unavailable)) }
        }
    }

    func cancel(_ input: [String: Any], reply: @escaping Reply) {
        queue.async { [self] in
            do {
                guard !closed else { throw NativeFailure.unavailable }
                try NativePolicy.keys(input, ["id"])
                let id = try NativePolicy.id(input["id"])
                prune()
                if let entry = entries[id] { abandon(entry) }
                else if completed[id] == nil {
                    guard cancelled.count < 32 else { throw NativeFailure.unavailable }
                    cancelled[id] = DispatchTime.now().uptimeNanoseconds + 30_000_000_000
                }
                reply(.success(NSNull()))
            } catch { reply(.failure(NativeFailure.unavailable)) }
        }
    }

    func cancelDocument() {
        queue.async { [self] in for entry in Array(entries.values) { abandon(entry) } }
    }

    func close() {
        queue.async { [self] in
            if closed { return }
            closed = true
            for entry in Array(entries.values) { abandon(entry) }
            cookies = nil
            session.invalidateAndCancel()
        }
    }

    private func current(_ entry: Entry) -> Bool {
        !closed && entries[entry.id] === entry && DispatchTime.now().uptimeNanoseconds <= entry.deadline
    }

    private func deadline(_ entry: Entry, seconds: Int) {
        entry.deadline = DispatchTime.now().uptimeNanoseconds + UInt64(seconds) * 1_000_000_000
        entry.timer.schedule(deadline: DispatchTime(uptimeNanoseconds: entry.deadline))
    }

    private func abandon(_ entry: Entry) {
        let reply = entry.head
        entry.head = nil
        finish(entry)
        reply?(.failure(NativeFailure.unavailable))
    }

    private func finish(_ entry: Entry) {
        guard entries[entry.id] === entry else { return }
        entries.removeValue(forKey: entry.id)
        tasks.removeValue(forKey: entry.exchange.task.taskIdentifier)
        bodyBytes -= entry.bodyBytes
        entry.timer.cancel()
        completed[entry.id] = DispatchTime.now().uptimeNanoseconds + 30_000_000_000
        if completed.count > 256, let oldest = completed.min(by: { $0.value < $1.value }) { completed.removeValue(forKey: oldest.key) }
        entry.exchange.close()
    }

    private func prune() {
        let now = DispatchTime.now().uptimeNanoseconds
        cancelled = cancelled.filter { $0.value > now }
        completed = completed.filter { $0.value > now }
    }

    private func entry(_ task: URLSessionTask) -> Entry? {
        guard let id = tasks[task.taskIdentifier], let entry = entries[id], entry.exchange.task === task else { return nil }
        return entry
    }

    func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive response: URLResponse, completionHandler: @escaping (URLSession.ResponseDisposition) -> Void) {
        guard let entry = entry(dataTask), current(entry) else { completionHandler(.cancel); return }
        do {
            let head = try NativeResponse(response, request: entry.exchange.request)
            if entry.exchange.request.credentials {
                guard let cookies else { throw NativeFailure.unavailable }
                try cookies.apply(entry.ticket, head.cookies)
            }
            guard current(entry) else { throw NativeFailure.unavailable }
            try entry.exchange.accept(head)
            let reply = entry.head; entry.head = nil
            deadline(entry, seconds: 30)
            completionHandler(.allow)
            reply?(.success(head.visible))
        } catch { completionHandler(.cancel); abandon(entry) }
    }

    func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
        guard let entry = entry(dataTask), current(entry) else { dataTask.cancel(); return }
        do { try entry.exchange.append(data) } catch { abandon(entry) }
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        guard let entry = entry(task), current(entry) else { return }
        do { try entry.exchange.complete(error) } catch { abandon(entry) }
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) {
        completionHandler(nil)
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, didReceive challenge: URLAuthenticationChallenge, completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void) {
        authenticate(challenge, completionHandler)
    }

    func urlSession(_ session: URLSession, didReceive challenge: URLAuthenticationChallenge, completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void) {
        authenticate(challenge, completionHandler)
    }

    private func authenticate(_ challenge: URLAuthenticationChallenge, _ reply: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void) {
        guard challenge.protectionSpace.authenticationMethod == NSURLAuthenticationMethodServerTrust else { reply(.cancelAuthenticationChallenge, nil); return }
        #if DEBUG && MOBILE_SYNTHETIC_TEST
        if let anchor = configuration.testAnchor {
            guard let trust = challenge.protectionSpace.serverTrust,
                  challenge.protectionSpace.host == configuration.destination.host,
                  SecTrustSetPolicies(trust, SecPolicyCreateSSL(true, challenge.protectionSpace.host as CFString)) == errSecSuccess,
                  SecTrustSetAnchorCertificates(trust, [anchor] as CFArray) == errSecSuccess,
                  SecTrustSetAnchorCertificatesOnly(trust, true) == errSecSuccess,
                  SecTrustEvaluateWithError(trust, nil) else { reply(.cancelAuthenticationChallenge, nil); return }
            reply(.useCredential, URLCredential(trust: trust)); return
        }
        #endif
        reply(.performDefaultHandling, nil)
    }
}
