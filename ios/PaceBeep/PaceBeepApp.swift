import HealthKit
import SwiftUI
import UserNotifications

@main
struct PaceBeepApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var delegate

    init() {
        // Before launch finishes, so a reminder tapped while the app was closed reaches it.
        UNUserNotificationCenter.current().delegate = Reminders.shared
        // Sets HealthKit's handler for the Watch's mirrored session, which must be in place at launch.
        _ = WatchLink.shared
    }

    var body: some Scene {
        WindowGroup { ContentView() }
    }
}

/// For the APNs device token (iOS hands it to the app delegate, each launch: it can change), and
/// for a Health permission the Watch app asks for on the phone.
final class AppDelegate: NSObject, UIApplicationDelegate {
    func applicationShouldRequestHealthAuthorization(_ application: UIApplication) {
        HKHealthStore().handleAuthorizationForExtension { _, _ in }
    }

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        Reminders.shared.deviceToken = deviceToken.map { String(format: "%02x", $0) }.joined()
    }
}
