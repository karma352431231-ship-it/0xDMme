#if DEBUG && MOBILE_SYNTHETIC_TEST
import Foundation
import XCTest
@testable import App

/** Independent native enforcement of explicit synthetic fixture destinations. */
final class NativeSyntheticEndpointTests: XCTestCase {
    private let token = String(repeating: "a", count: 64)

    func testLegacyLoopbackContractRemainsExplicitAndHasNoPhysicalAdmission() throws {
        let value = try NativeSyntheticEndpoint(["kind": "synthetic-native-v1", "url": "https://127.0.0.1:45118/"])
        XCTAssertEqual(value.url.host, "127.0.0.1")
        XCTAssertNil(value.admission)
        for url in ["http://127.0.0.1:45118/", "https://localhost:45118/", "https://10.0.0.1:45118/", "https://127.0.0.1:443/", "https://127.0.0.1:45118/path"] {
            XCTAssertThrowsError(try NativeSyntheticEndpoint(["kind": "synthetic-native-v1", "url": url]))
        }
    }

    func testPhysicalFixtureRequiresPrivateLiteralIPv4AndItsOwnExactAdmission() throws {
        for host in ["10.0.0.1", "172.16.0.1", "172.31.255.254", "192.168.1.2"] {
            let value = try NativeSyntheticEndpoint(["kind": "synthetic-native-physical-v1", "url": "https://\(host):45118/", "admission": token])
            XCTAssertEqual(value.url.host, host)
            XCTAssertEqual(value.admission, token)
        }
        for host in ["127.0.0.1", "0.0.0.0", "8.8.8.8", "172.15.0.1", "172.32.0.1", "169.254.1.2", "192.168.1.999", "192.168.01.2", "fixture.invalid", "[::1]"] {
            XCTAssertThrowsError(try NativeSyntheticEndpoint(["kind": "synthetic-native-physical-v1", "url": "https://\(host):45118/", "admission": token]))
        }
        for invalid in ["", String(repeating: "z", count: 64), token + "\n"] {
            XCTAssertThrowsError(try NativeSyntheticEndpoint(["kind": "synthetic-native-physical-v1", "url": "https://192.168.1.2:45118/", "admission": invalid]))
        }
    }

    func testFixtureRejectsCredentialsQueriesWrongPortsUnknownKindsAndExtraFields() {
        for url in ["http://192.168.1.2:45118/", "https://user@192.168.1.2:45118/", "https://192.168.1.2:45118/?query=yes", "https://192.168.1.2:45118/#fragment", "https://192.168.1.2:45120/", "https://192.168.1.2:45118/api/account/session"] {
            XCTAssertThrowsError(try NativeSyntheticEndpoint(["kind": "synthetic-native-physical-v1", "url": url, "admission": token]))
        }
        XCTAssertThrowsError(try NativeSyntheticEndpoint(["kind": "unknown", "url": "https://127.0.0.1:45118/"]))
        XCTAssertThrowsError(try NativeSyntheticEndpoint(["kind": "synthetic-native-physical-v1", "url": "https://192.168.1.2:45118/"]))
        XCTAssertThrowsError(try NativeSyntheticEndpoint(["kind": "synthetic-native-v1", "url": "https://127.0.0.1:45118/", "admission": token]))
    }
}
#endif
