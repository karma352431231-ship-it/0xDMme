#if DEBUG && MOBILE_SYNTHETIC_TEST
import Foundation
import UserNotifications
import XCTest
@testable import App

/** Free-account physical OS control, not remote-push or product integration
 * acceptance. Owns one generic synthetic notification; never reads or clears
 * other notifications, account data or the owner's personal applications.
 */
final class NativeLocalNotificationContractTests: XCTestCase {
    func testGenericLocalNotificationReachesOSPresentation() async throws {
        guard Bundle.main.bundleIdentifier == "app.zeroxdmme.development.recovery",
              let marker = Bundle.main.url(forResource: "native-local-notification-control", withExtension: "json"),
              try Data(contentsOf: marker) == Data("{\"kind\":\"synthetic-local-notification-v1\"}\n".utf8) else {
            throw NSError(domain: "NativeLocalNotificationFixture", code: 1)
        }
        let center = UNUserNotificationCenter.current()
        let id = "0xdmme.synthetic.local." + UUID().uuidString.lowercased()
        let observer = NativeSyntheticNotificationPresentation(id: id)
        let previous = center.delegate
        center.delegate = observer
        defer {
            center.removePendingNotificationRequests(withIdentifiers: [id])
            center.removeDeliveredNotifications(withIdentifiers: [id])
            center.delegate = previous
        }
        let allowed = try await center.requestAuthorization(options: [.alert, .sound])
        XCTAssertTrue(allowed, "Local notification permission was not granted.")
        let settings = await center.notificationSettings()
        XCTAssertEqual(settings.authorizationStatus, .authorized)
        XCTAssertEqual(settings.alertSetting, .enabled)
        let content = UNMutableNotificationContent()
        content.title = "0xDMme"
        content.body = "Synthetic local notification test."
        content.sound = .default
        XCTAssertTrue(content.userInfo.isEmpty)
        let request = UNNotificationRequest(identifier: id, content: content, trigger: UNTimeIntervalNotificationTrigger(timeInterval: 3, repeats: false))
        try await center.add(request)
        let deadline = Date().addingTimeInterval(15)
        var delivered = false
        while Date() < deadline {
            let notifications = await center.deliveredNotifications()
            delivered = notifications.contains { notification in
                notification.request.identifier == id && notification.request.content.title == content.title &&
                notification.request.content.body == content.body && notification.request.content.userInfo.isEmpty
            }
            if delivered && observer.observed { break }
            try await Task.sleep(nanoseconds: 200_000_000)
        }
        XCTAssertTrue(delivered, "The OS did not retain the selected generic notification.")
        XCTAssertTrue(observer.observed, "The OS did not request foreground presentation.")
        center.removePendingNotificationRequests(withIdentifiers: [id])
        center.removeDeliveredNotifications(withIdentifiers: [id])
        let pending = await center.pendingNotificationRequests()
        let retained = await center.deliveredNotifications()
        XCTAssertFalse(pending.contains { $0.identifier == id })
        XCTAssertFalse(retained.contains { $0.request.identifier == id })
        // Metadata only. No token, device identity or notification content output.
        print("NATIVE_LOCAL_NOTIFICATION_CONTROL:permission=true,presentation=true,delivered=true,scopedCleanup=true,remotePush=false")
    }
}

private final class NativeSyntheticNotificationPresentation: NSObject, UNUserNotificationCenterDelegate {
    private let id: String
    private let lock = NSLock()
    private var presented = false
    init(id: String) { self.id = id }
    var observed: Bool {
        lock.lock(); defer { lock.unlock() }
        return presented
    }
    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification, withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        guard notification.request.identifier == id else { completionHandler([]); return }
        lock.lock(); presented = true; lock.unlock()
        completionHandler([.banner, .list, .sound])
    }
}
#endif
