#if DEBUG && MOBILE_SYNTHETIC_TEST
import Foundation
import CoreFoundation

/** Explicit fixture handoff only. Accepts synthetic public identifiers/routes,
 * never content or key material. Owns at most 16 protected result files; normal
 * builds have neither this type nor its private project membership.
 */
struct NativeDirectProductOutput {
    let action: String
    let value: String
    private static let uuid = "[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}"
    private static let identities: Set<String> = [
        "message-send", "message-receive", "message-edit", "message-reply", "message-reply-receive", "message-read-receipt",
        "attachment-send", "attachment-receive", "attachment-recover-own", "attachment-pick-send", "group-send", "group-receive", "social-voice-receive"
    ]

    init(action: String, value: String) throws {
        if action == "social-voice-send" {
            guard value.utf8.count <= 256,
                  let bytes = value.data(using: .utf8),
                  let raw = try JSONSerialization.jsonObject(with: bytes) as? [String: Any],
                  Set(raw.keys) == Set(["id", "duration"]),
                  let id = raw["id"] as? String, id.utf8.count == 36, NativePolicy.matches(id, "^" + Self.uuid + "$"),
                  let duration = raw["duration"] as? NSNumber, CFGetTypeID(duration) != CFBooleanGetTypeID(),
                  duration.doubleValue.isFinite, duration.doubleValue > 0, duration.doubleValue <= 90 else { throw NativeFailure.unavailable }
            self.action = action; self.value = value
            return
        }
        guard value.utf8.count <= 1024, value.rangeOfCharacter(from: .whitespacesAndNewlines) == nil else { throw NativeFailure.unavailable }
        let pattern: String?
        if action == "conversation-pin" { pattern = "^(true|false)$" }
        else if action == "contact-discovery-prepare" { pattern = "^(invite|wallet|contacts)$" }
        else if Self.identities.contains(action) { pattern = "^" + Self.uuid + "$" }
        else if action == "invite-create" {
            pattern = "^https://0xdmme\\.app/#contatos\\?convite=" + Self.uuid + "\\.[a-f0-9]{64}$"
        } else if action == "community-create" || action == "community-post" {
            pattern = "^#comunidades\\?id=" + Self.uuid + "(?:&post=" + Self.uuid + ")?$"
        } else { pattern = nil }
        if let pattern {
            guard NativePolicy.matches(value, pattern) else { throw NativeFailure.unavailable }
        } else if !value.isEmpty { throw NativeFailure.unavailable }
        self.action = action; self.value = value
    }

    func save(run: String) throws {
        guard UUID(uuidString: run)?.uuidString.lowercased() == run else { throw NativeFailure.unavailable }
        #if os(iOS)
        let root = try Self.directory()
        try Self.makeRoom(root)
        let target = root.appendingPathComponent(run + ".json")
        guard !FileManager.default.fileExists(atPath: target.path) else { throw NativeFailure.unavailable }
        let bytes = try JSONSerialization.data(withJSONObject: ["schema": 1, "run": run, "action": action, "value": value], options: .sortedKeys)
        guard bytes.count <= 4096 else { throw NativeFailure.unavailable }
        try bytes.write(to: target, options: [.atomic, .completeFileProtection])
        try Self.protect(target)
        #else
        // Complementary macOS tests exercise validation only. They cannot
        // substitute another OS policy for the physical iOS result store.
        throw NativeFailure.unavailable
        #endif
    }

    #if os(iOS)
    private static func directory() throws -> URL {
        let manager = FileManager.default
        let caches = try manager.url(for: .cachesDirectory, in: .userDomainMask, appropriateFor: nil, create: true).resolvingSymlinksInPath()
        let root = caches.appendingPathComponent("0xdmme-native-product-fixture", isDirectory: true)
        if !manager.fileExists(atPath: root.path) {
            try manager.createDirectory(at: root, withIntermediateDirectories: false, attributes: [.protectionKey: FileProtectionType.complete])
        }
        let attributes = try root.resourceValues(forKeys: [.isDirectoryKey, .isSymbolicLinkKey])
        guard attributes.isDirectory == true, attributes.isSymbolicLink == false else { throw NativeFailure.unavailable }
        try protect(root)
        return root
    }

    private static func makeRoom(_ root: URL) throws {
        let manager = FileManager.default
        guard let iterator = manager.enumerator(at: root, includingPropertiesForKeys: [.isRegularFileKey, .isSymbolicLinkKey, .contentModificationDateKey], options: [.skipsSubdirectoryDescendants]) else { throw NativeFailure.unavailable }
        var files: [(URL, Date)] = []
        for case let file as URL in iterator {
            guard files.count < 16, NativePolicy.matches(file.lastPathComponent, "^" + uuid + "\\.json$") else { throw NativeFailure.unavailable }
            let attributes = try file.resourceValues(forKeys: [.isRegularFileKey, .isSymbolicLinkKey, .contentModificationDateKey])
            guard attributes.isRegularFile == true, attributes.isSymbolicLink == false,
                  let date = attributes.contentModificationDate else { throw NativeFailure.unavailable }
            files.append((file, date))
        }
        if files.count == 16, let oldest = files.min(by: { $0.1 < $1.1 }) {
            try manager.removeItem(at: oldest.0)
        }
    }

    private static func protect(_ path: URL) throws {
        var target = path
        var values = URLResourceValues(); values.isExcludedFromBackup = true
        try target.setResourceValues(values)
        try FileManager.default.setAttributes([.protectionKey: FileProtectionType.complete], ofItemAtPath: path.path)
    }
    #endif
}
#endif
