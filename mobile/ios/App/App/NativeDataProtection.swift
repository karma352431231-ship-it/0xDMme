import Foundation

/** Owns the installed WebKit/local-store backup and OS-lock protection policy. */
enum NativeDataProtection {
    static func prepare() throws {
        let manager = FileManager.default
        let library = try manager.url(for: .libraryDirectory, in: .userDomainMask, appropriateFor: nil, create: true).resolvingSymlinksInPath()
        try protect(library)
        let runtimeCodeCache = library.appendingPathComponent("Caches/com.apple.dyld", isDirectory: true)
        guard let children = manager.enumerator(at: library, includingPropertiesForKeys: [.isSymbolicLinkKey], options: [.skipsHiddenFiles]) else { throw NativeFailure.unavailable }
        for case let path as URL in children {
            // Never follow links out of the app's own Library.
            let info = try path.resourceValues(forKeys: [.isSymbolicLinkKey])
            if info.isSymbolicLink == true { children.skipDescendants(); continue }
            // iOS owns this read-only loader cache, which contains executable
            // code rather than product data. Do not mutate its attributes.
            // Library remains excluded from backup; WebKit and every other
            // app data entry still require Complete protection below.
            if path.standardizedFileURL.path == runtimeCodeCache.path {
                children.skipDescendants()
                continue
            }
            try protect(path)
        }
    }

    private static func protect(_ path: URL) throws {
        var url = path
        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        try url.setResourceValues(values)
        try FileManager.default.setAttributes([.protectionKey: FileProtectionType.complete], ofItemAtPath: path.path)
    }
}
