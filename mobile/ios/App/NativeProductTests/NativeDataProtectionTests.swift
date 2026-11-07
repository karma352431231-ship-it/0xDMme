import Foundation
import XCTest
@testable import App

/** Actual iOS filesystem policy, not a mock of the protection operation.
 * The test owns only its synthetic directory and temporary link target.
 */
final class NativeDataProtectionTests: XCTestCase {
    func testPreparationProtectsAppDataWithoutFollowingLinksOrMutatingSystemCodeCache() throws {
        let manager = FileManager.default
        let library = try manager.url(for: .libraryDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
        let directory = library.appendingPathComponent("0xdmme-protection-test-" + UUID().uuidString, isDirectory: true)
        let outside = manager.temporaryDirectory.appendingPathComponent("0xdmme-unrelated-test-" + UUID().uuidString)
        try manager.createDirectory(at: directory, withIntermediateDirectories: false)
        addTeardownBlock {
            try manager.removeItem(at: directory)
            if manager.fileExists(atPath: outside.path) { try manager.removeItem(at: outside) }
        }
        let owned = directory.appendingPathComponent("synthetic-data")
        let bytes = Data("synthetic protection contract".utf8)
        try bytes.write(to: owned, options: .completeFileProtectionUntilFirstUserAuthentication)
        try bytes.write(to: outside, options: .completeFileProtectionUntilFirstUserAuthentication)
        let originalOutsideProtection = try manager.attributesOfItem(atPath: outside.path)[.protectionKey] as? FileProtectionType
        try manager.createSymbolicLink(at: directory.appendingPathComponent("outside-link"), withDestinationURL: outside)

        // Before the fix, the real device's read-only dyld code-cache file
        // caused a permission error and prevented all product UI from loading.
        try NativeDataProtection.prepare()
        try NativeDataProtection.prepare()

        XCTAssertTrue(try library.resourceValues(forKeys: [.isExcludedFromBackupKey]).isExcludedFromBackup == true)
        XCTAssertTrue(try owned.resourceValues(forKeys: [.isExcludedFromBackupKey]).isExcludedFromBackup == true)
        let protection = try manager.attributesOfItem(atPath: owned.path)[.protectionKey] as? FileProtectionType
        XCTAssertEqual(protection, .complete)
        XCTAssertEqual(try Data(contentsOf: owned), bytes)
        let outsideProtection = try manager.attributesOfItem(atPath: outside.path)[.protectionKey] as? FileProtectionType
        XCTAssertNotNil(originalOutsideProtection)
        XCTAssertEqual(outsideProtection, originalOutsideProtection)
        XCTAssertEqual(try Data(contentsOf: outside), bytes)
    }
}
