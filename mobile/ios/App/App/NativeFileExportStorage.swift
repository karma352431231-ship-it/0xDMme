import Foundation

/** Owns only app-private temporary export files. A user-selected external copy
 * is owned by the document provider and is never read back or deleted here.
 */
final class NativeFileExportStorage {
    struct Stage {
        let directory: URL
        let file: URL

        func remove() throws {
            if FileManager.default.fileExists(atPath: directory.path) {
                try FileManager.default.removeItem(at: directory)
            }
        }

        func protectCompletedFile() throws {
            let values = try file.resourceValues(forKeys: [.isRegularFileKey, .isSymbolicLinkKey])
            guard values.isRegularFile == true, values.isSymbolicLink == false else { throw NativeFailure.unavailable }
            try NativeFileExportStorage.protect(file)
        }
    }

    private var root: URL?

    func prepare() throws {
        let manager = FileManager.default
        let caches = try manager.url(for: .cachesDirectory, in: .userDomainMask, appropriateFor: nil, create: true).resolvingSymlinksInPath()
        let root = caches.appendingPathComponent("0xdmme-file-exports", isDirectory: true)
        if !manager.fileExists(atPath: root.path) {
            try manager.createDirectory(at: root, withIntermediateDirectories: false, attributes: [.protectionKey: FileProtectionType.complete, .posixPermissions: 0o700])
        }
        let values = try root.resourceValues(forKeys: [.isDirectoryKey, .isSymbolicLinkKey])
        guard values.isDirectory == true, values.isSymbolicLink == false else { throw NativeFailure.unavailable }
        try Self.protect(root)
        try removeAbandonedStages(root)
        self.root = root
    }

    func create(suggestedFilename: String) throws -> Stage {
        if root == nil { try prepare() }
        guard let root else { throw NativeFailure.unavailable }
        let manager = FileManager.default
        let directory = root.appendingPathComponent(UUID().uuidString.lowercased(), isDirectory: true)
        try manager.createDirectory(at: directory, withIntermediateDirectories: false, attributes: [.protectionKey: FileProtectionType.complete, .posixPermissions: 0o700])
        do {
            try Self.protect(directory)
            return Stage(directory: directory, file: directory.appendingPathComponent(Self.filename(suggestedFilename)))
        } catch {
            try manager.removeItem(at: directory)
            throw error
        }
    }

    private func removeAbandonedStages(_ root: URL) throws {
        let manager = FileManager.default
        let children = try manager.contentsOfDirectory(at: root, includingPropertiesForKeys: [.isDirectoryKey, .isSymbolicLinkKey])
        guard children.count <= 16 else { throw NativeFailure.unavailable }
        for child in children {
            let values = try child.resourceValues(forKeys: [.isDirectoryKey, .isSymbolicLinkKey])
            guard UUID(uuidString: child.lastPathComponent)?.uuidString.lowercased() == child.lastPathComponent,
                  values.isDirectory == true, values.isSymbolicLink == false else { throw NativeFailure.unavailable }
            try manager.removeItem(at: child)
        }
    }

    static func filename(_ suggestion: String) -> String {
        let name = (suggestion as NSString).lastPathComponent
        guard !name.isEmpty, ![".", ".."].contains(name), name.utf8.count <= 240,
              !name.unicodeScalars.contains(where: { CharacterSet.controlCharacters.contains($0) }),
              !name.contains("\\"), !name.contains(":") else { return "0xDMme-file" }
        return name
    }

    private static func protect(_ value: URL) throws {
        var url = value
        var attributes = URLResourceValues()
        attributes.isExcludedFromBackup = true
        try url.setResourceValues(attributes)
        try FileManager.default.setAttributes([.protectionKey: FileProtectionType.complete], ofItemAtPath: url.path)
    }
}
