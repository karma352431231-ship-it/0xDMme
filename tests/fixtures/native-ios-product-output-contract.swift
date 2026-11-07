#if DEBUG && MOBILE_SYNTHETIC_TEST
import Foundation
import XCTest
@testable import App

final class NativeDirectProductOutputContractTests: XCTestCase {
    private let id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"

    func testOnlySyntheticIdentifiersCanonicalInvitationsAndPublicRoutesAreAdmitted() throws {
        let invitation = "https://0xdmme.app/#contatos?convite=" + id + "." + String(repeating: "a", count: 64)
        for (action, value) in [
            ("message-send", id), ("message-read-receipt", id), ("attachment-receive", id), ("group-send", id),
            ("invite-create", invitation), ("community-create", "#comunidades?id=" + id),
            ("community-post", "#comunidades?id=" + id + "&post=" + id), ("profile-check", ""),
            ("conversation-pin", "true"), ("conversation-pin", "false"), ("social-voice-receive", id),
            ("contact-discovery-prepare", "contacts")
        ] {
            XCTAssertEqual(try NativeDirectProductOutput(action: action, value: value).value, value)
        }
    }

    func testContentOtherOriginsMalformedIdentifiersAndExtraParametersAreRejected() {
        for (action, value) in [
            ("message-send", "synthetic decrypted content"), ("message-send", String(repeating: "a", count: 36)),
            ("message-send", id + "\n"), ("message-send", id + " "),
            ("invite-create", "https://other.invalid/#contatos?convite=" + id + "." + String(repeating: "a", count: 64)),
            ("community-create", "https://0xdmme.app/#comunidades?id=" + id),
            ("community-post", "#comunidades?id=" + id + "&text=private"),
            ("profile-check", "synthetic private name"), ("unknown-action", String(repeating: "a", count: 64)),
            ("invite-create", String(repeating: "a", count: 1025)),
            ("conversation-pin", "{}"), ("conversation-pin", "FALSE"), ("conversation-pin", "false\n"),
            ("contact-discovery-prepare", "{\"mode\":\"contacts\",\"private\":\"content\"}")
        ] {
            XCTAssertThrowsError(try NativeDirectProductOutput(action: action, value: value))
        }
    }

    func testVoiceOutputAdmitsOnlyAcceptedIdentityAndNonzeroBoundedDuration() throws {
        let value = "{\"id\":\"" + id + "\",\"duration\":1.8}"
        XCTAssertEqual(try NativeDirectProductOutput(action: "social-voice-send", value: value).value, value)
        for invalid in [
            "{\"id\":\"" + id + "\",\"duration\":0}", "{\"id\":\"" + id + "\",\"duration\":91}",
            "{\"id\":\"" + id + "\",\"duration\":true}", "{\"id\":\"" + id + "\",\"duration\":2,\"content\":\"private\"}",
            "{\"id\":\"other\",\"duration\":2}"
        ] {
            XCTAssertThrowsError(try NativeDirectProductOutput(action: "social-voice-send", value: invalid))
        }
    }

    #if os(iOS)
    func testResultFilesStayBoundedProtectedAndSeparateFromConsoleReports() throws {
        let manager = FileManager.default
        let caches = try manager.url(for: .cachesDirectory, in: .userDomainMask, appropriateFor: nil, create: true).resolvingSymlinksInPath()
        let root = caches.appendingPathComponent("0xdmme-native-product-fixture", isDirectory: true)
        let runs = (0..<17).map { _ in UUID().uuidString.lowercased() }
        addTeardownBlock {
            for run in runs {
                let file = root.appendingPathComponent(run + ".json")
                if manager.fileExists(atPath: file.path) { try manager.removeItem(at: file) }
            }
        }
        let value = try NativeDirectProductOutput(action: "message-send", value: id)
        XCTAssertThrowsError(try value.save(run: "../../unrelated-file"))
        for run in runs { try value.save(run: run) }
        let files = try manager.contentsOfDirectory(at: root, includingPropertiesForKeys: nil)
        XCTAssertEqual(files.count, 16)
        let last = root.appendingPathComponent(try XCTUnwrap(runs.last) + ".json")
        let bytes = try Data(contentsOf: last)
        XCTAssertLessThanOrEqual(bytes.count, 4096)
        let record = try XCTUnwrap(try JSONSerialization.jsonObject(with: bytes) as? [String: Any])
        XCTAssertEqual(Set(record.keys), Set(["schema", "run", "action", "value"]))
        XCTAssertEqual(record["run"] as? String, runs.last)
        XCTAssertEqual(record["value"] as? String, id)
        XCTAssertTrue(try last.resourceValues(forKeys: [.isExcludedFromBackupKey]).isExcludedFromBackup == true)
        let protection = try manager.attributesOfItem(atPath: last.path)[.protectionKey] as? FileProtectionType
        XCTAssertEqual(protection, .complete)
    }
    #else
    func testOtherPlatformsCannotSubstituteAnUnprotectedResultStore() throws {
        let value = try NativeDirectProductOutput(action: "message-send", value: id)
        XCTAssertThrowsError(try value.save(run: UUID().uuidString.lowercased()))
    }
    #endif
}
#endif
