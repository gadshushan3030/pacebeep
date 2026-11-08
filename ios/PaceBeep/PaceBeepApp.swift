import SwiftUI
import UserNotifications

@main
struct PaceBeepApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var delegate

    init() {
        // Before launch finishes, so a reminder tapped while the app was closed reaches it.
        UNUserNotificationCenter.current().delegate = Reminders.shared
    }

    var body: some Scene {
        WindowGroup { ContentView() }
    }
}

/// Only for the APNs device token: iOS hands it to the app delegate, each launch (it can change).
final class AppDelegate: NSObject, UIApplicationDelegate {
    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        Reminders.shared.deviceToken = deviceToken.map { String(format: "%02x", $0) }.joined()
    }
}
