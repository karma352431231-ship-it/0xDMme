import Foundation
import Security

/** Native-only composition. Test TLS code is absent from ordinary/release builds. */
struct NativeConnectionConfiguration {
    let destination: URL
    let testAnchor: SecCertificate?
    #if DEBUG && MOBILE_SYNTHETIC_TEST
    let testAdmission: String?
    init(destination: URL, testAnchor: SecCertificate?, testAdmission: String? = nil) {
        self.destination = destination; self.testAnchor = testAnchor; self.testAdmission = testAdmission
    }
    #endif
}

enum NativeConnectionFactory {
    static func configuration() throws -> NativeConnectionConfiguration {
        #if DEBUG && MOBILE_SYNTHETIC_TEST
        guard let file = Bundle.main.url(forResource: "native-synthetic-test", withExtension: "json"),
              let ca = Bundle.main.url(forResource: "native-synthetic-ca", withExtension: "pem") else { throw NativeFailure.unavailable }
        let bytes = try Data(contentsOf: file)
        guard bytes.count <= 1024, let raw = try JSONSerialization.jsonObject(with: bytes) as? [String: Any] else { throw NativeFailure.unavailable }
        let endpoint = try NativeSyntheticEndpoint(raw)
        let pem = try String(contentsOf: ca, encoding: .utf8)
        guard pem.utf8.count <= 8192 else { throw NativeFailure.unavailable }
        let encoded = pem.replacingOccurrences(of: "-----BEGIN CERTIFICATE-----", with: "")
            .replacingOccurrences(of: "-----END CERTIFICATE-----", with: "")
            .components(separatedBy: .whitespacesAndNewlines).joined()
        guard let der = Data(base64Encoded: encoded), let anchor = SecCertificateCreateWithData(nil, der as CFData) else { throw NativeFailure.unavailable }
        return NativeConnectionConfiguration(destination: endpoint.url, testAnchor: anchor, testAdmission: endpoint.admission)
        #else
        return NativeConnectionConfiguration(destination: URL(string: NativePolicy.service + "/")!, testAnchor: nil)
        #endif
    }
}
