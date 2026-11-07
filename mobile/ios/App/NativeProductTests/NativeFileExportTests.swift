import Foundation
import XCTest
@testable import App

@MainActor
final class NativeFileExportTests: XCTestCase {
    func testOnlyLocalPackagedBlobURLsCanEnterExport() throws {
        XCTAssertTrue(NativeFileExport.localBlob(URL(string: "blob:capacitor://localhost/" + UUID().uuidString.lowercased())))
        for text in ["https://0xdmme.app/file", "file:///private/file", "data:text/plain,test", "blob:https://0xdmme.app/id", "blob:capacitor://localhost.evil/id", "blob:capacitor://localhost:443/id", "blob:capacitor://localhost/id?extra", "blob:capacitor://localhost/id#extra"] {
            XCTAssertFalse(NativeFileExport.localBlob(URL(string: text)), text)
        }
        XCTAssertFalse(NativeFileExport.localBlob(nil))
        XCTAssertEqual(NativeFileExportStorage.filename("../../outside.txt"), "outside.txt")
        for name in ["", "..", "bad\nname", "bad\\name", String(repeating: "a", count: 241)] {
            XCTAssertEqual(NativeFileExportStorage.filename(name), "0xDMme-file")
        }
    }

    func testTemporaryExportIsProtectedExcludedAndExplicitlyRemoved() throws {
        let storage = NativeFileExportStorage()
        let stage = try storage.create(suggestedFilename: "synthetic-export.txt")
        addTeardownBlock { try stage.remove() }
        let expected = Data("synthetic native export fixture".utf8)
        try expected.write(to: stage.file, options: [.atomic, .completeFileProtection])
        try stage.protectCompletedFile()
        XCTAssertEqual(try Data(contentsOf: stage.file), expected)
        for path in [stage.directory, stage.file] {
            XCTAssertTrue(try path.resourceValues(forKeys: [.isExcludedFromBackupKey]).isExcludedFromBackup == true)
            let protection = try FileManager.default.attributesOfItem(atPath: path.path)[.protectionKey] as? FileProtectionType
            XCTAssertEqual(protection, .complete)
        }
        try stage.remove()
        XCTAssertFalse(FileManager.default.fileExists(atPath: stage.directory.path))
    }

    func testNextOwnerCleansAbandonedStageAndRejectsSymlinkWithoutFollowingIt() throws {
        let storage = NativeFileExportStorage()
        let stage = try storage.create(suggestedFilename: "abandoned.txt")
        addTeardownBlock { try stage.remove() }
        try Data("synthetic abandoned export".utf8).write(to: stage.file, options: [.completeFileProtection])
        try NativeFileExportStorage().prepare()
        XCTAssertFalse(FileManager.default.fileExists(atPath: stage.directory.path))
        let manager = FileManager.default
        let outside = manager.temporaryDirectory.appendingPathComponent("0xdmme-export-contract-" + UUID().uuidString.lowercased())
        try manager.createDirectory(at: outside, withIntermediateDirectories: false)
        addTeardownBlock { try manager.removeItem(at: outside) }
        let preserved = outside.appendingPathComponent("preserved.txt")
        let bytes = Data("synthetic outside target must remain unchanged".utf8)
        try bytes.write(to: preserved, options: [.completeFileProtection])
        let link = stage.directory.deletingLastPathComponent().appendingPathComponent(UUID().uuidString.lowercased())
        try manager.createSymbolicLink(at: link, withDestinationURL: outside)
        addTeardownBlock { try manager.removeItem(at: link) }
        XCTAssertThrowsError(try NativeFileExportStorage().prepare())
        XCTAssertEqual(try Data(contentsOf: preserved), bytes)
    }
}
