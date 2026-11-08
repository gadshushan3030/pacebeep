import UIKit
import UserNotifications

/// Local reminders for approved workouts: iOS fires them at the workout's time, with the app
/// closed and the phone offline. The text is generic, so it can never be wrong about content.
/// Tapping one opens the app on that workout, ready to start.
/// Also the server's push ("New workout from your coach"): the same permission covers it, its
/// tap opens the workout the same way, and the device token it needs passes through here.
final class Reminders: NSObject, UNUserNotificationCenterDelegate {
    static let shared = Reminders()
    static let center = UNUserNotificationCenter.current()

    /// Where a tapped reminder's workout id goes (the home screen). A tap that came before anyone
    /// listened (the app launched from it) is delivered as soon as someone does.
    @MainActor var onOpen: ((String) -> Void)? {
        didSet { if let id = opened, let onOpen { opened = nil; onOpen(id) } }
    }
    @MainActor private var opened: String?

    /// The APNs device token, hex, as iOS gives it (each launch; it can change); Coach sends it to the server.
    @MainActor var deviceToken: String? {
        didSet { if let deviceToken { onToken?(deviceToken) } }
    }
    @MainActor var onToken: ((String) -> Void)? {
        didSet { if let deviceToken { onToken?(deviceToken) } }
    }

    /// Asks iOS for the device token, only once the runner said yes to notifications (a push they
    /// would never see is not worth a row on the server). iOS answers through AppDelegate.
    static func registerForPush() {
        center.getNotificationSettings { settings in
            guard settings.authorizationStatus == .authorized else { return }
            Task { @MainActor in UIApplication.shared.registerForRemoteNotifications() }
        }
    }

    /// One reminder per approved upcoming workout with a day and a time, identifier = workout id;
    /// every other reminder (done, removed, back to pending, time moved) goes. Without permission
    /// iOS keeps none of them, quietly.
    static func schedule(_ workouts: [Workout]) {
        center.removeAllPendingNotificationRequests()
        center.removeDeliveredNotifications(withIdentifiers: workouts.filter(\.done).map(\.id))
        let content = UNMutableNotificationContent()
        content.title = "Time for today's workout"
        content.body = "Open PaceBeep to start."
        content.sound = .default
        for w in workouts where !w.pending && !w.done {
            guard let date = w.scheduledDate, date > Date() else { continue }
            let at = Calendar.current.dateComponents([.year, .month, .day, .hour, .minute], from: date)
            center.add(UNNotificationRequest(identifier: w.id, content: content, trigger: UNCalendarNotificationTrigger(dateMatching: at, repeats: false)))
        }
    }

    // The completion-handler form, finished on the main actor: UIKit snapshots the window in the
    // completion and asserts it is on the main thread. The async form ran it on the cooperative
    // pool, which crashed every tap on a reminder (#17).
    func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse,
                                withCompletionHandler completionHandler: @escaping () -> Void) {
        // A reminder is identified by its workout; the server's push carries the workout in its payload.
        let content = response.notification.request.content
        let id = content.userInfo["workout_id"] as? String ?? response.notification.request.identifier
        Task { @MainActor in
            if let onOpen { onOpen(id) } else { opened = id }
            completionHandler()
        }
    }
}
