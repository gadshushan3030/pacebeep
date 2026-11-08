import UserNotifications

/// Local reminders for approved workouts: iOS fires them at the workout's time, with the app
/// closed and the phone offline. The text is generic, so it can never be wrong about content.
/// Tapping one opens the app on that workout, ready to start.
final class Reminders: NSObject, UNUserNotificationCenterDelegate {
    static let shared = Reminders()
    static let center = UNUserNotificationCenter.current()

    /// Where a tapped reminder's workout id goes (the home screen). A tap that came before anyone
    /// listened (the app launched from it) is delivered as soon as someone does.
    @MainActor var onOpen: ((String) -> Void)? {
        didSet { if let id = opened, let onOpen { opened = nil; onOpen(id) } }
    }
    @MainActor private var opened: String?

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

    func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse) async {
        let id = response.notification.request.identifier
        await MainActor.run { if let onOpen { onOpen(id) } else { opened = id } }
    }
}
