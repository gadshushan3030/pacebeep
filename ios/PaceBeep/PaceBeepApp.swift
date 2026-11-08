import SwiftUI
import UserNotifications

@main
struct PaceBeepApp: App {
    init() {
        // Before launch finishes, so a reminder tapped while the app was closed reaches it.
        UNUserNotificationCenter.current().delegate = Reminders.shared
    }

    var body: some Scene {
        WindowGroup { ContentView() }
    }
}
