import Foundation
import Security

/** Keychain custody only. Tokens never enter UserDefaults, files or WebKit. */
final class NativeCookieStore {
    private let query: [String: Any] = [
        kSecClass as String: kSecClassGenericPassword,
        kSecAttrService as String: "app.zeroxdmme.native.session.v1",
        kSecAttrAccount as String: "private-cookies",
        kSecAttrSynchronizable as String: false,
    ]

    func load() throws -> Data {
        let manager = FileManager.default
        let library = try manager.url(for: .libraryDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
        let marker = library.appendingPathComponent("0xdmme-native-install-v1")
        if !manager.fileExists(atPath: marker.path) {
            // Keychain items can outlive uninstall. A fresh private install marker
            // starts a new session rather than adopting an orphaned old token.
            let removed = SecItemDelete(query as CFDictionary)
            guard removed == errSecSuccess || removed == errSecItemNotFound else { throw NativeFailure.unavailable }
            let empty = Data("{\"version\":1,\"cookies\":[]}".utf8)
            try save(empty, create: true)
            try Data("0xDMme native install v1".utf8).write(to: marker, options: [.atomic, .completeFileProtection])
            var excluded = marker
            var values = URLResourceValues(); values.isExcludedFromBackup = true
            try excluded.setResourceValues(values)
            return empty
        }
        guard try Data(contentsOf: marker) == Data("0xDMme native install v1".utf8) else { throw NativeFailure.unavailable }
        var read = query
        read[kSecReturnData as String] = true
        read[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        guard SecItemCopyMatching(read as CFDictionary, &result) == errSecSuccess,
              let bytes = result as? Data, bytes.count <= 4096 else { throw NativeFailure.unavailable }
        return bytes
    }

    func save(_ bytes: Data, create: Bool = false) throws {
        guard bytes.count <= 4096 else { throw NativeFailure.unavailable }
        var attributes: [String: Any] = [kSecValueData as String: bytes,
            kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly]
        let status: OSStatus
        if create {
            attributes.merge(query) { _, new in new }
            status = SecItemAdd(attributes as CFDictionary, nil)
        } else { status = SecItemUpdate(query as CFDictionary, attributes as CFDictionary) }
        guard status == errSecSuccess else { throw NativeFailure.unavailable }
    }

    func assertUnlocked() throws {
        var read = query
        read[kSecReturnData as String] = true
        read[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        guard SecItemCopyMatching(read as CFDictionary, &result) == errSecSuccess,
              let bytes = result as? Data, bytes.count <= 4096 else { throw NativeFailure.unavailable }
    }
}
