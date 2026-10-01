import ActivityKit
import Foundation

/// The Live Activity on the lock screen and in the Dynamic Island. The app sends one state per
/// segment; iOS ticks the countdown from `start...end` by itself.
struct WorkoutActivity: ActivityAttributes {
    struct ContentState: Codable, Hashable {
        var title: String
        var isWork: Bool
        var start: Date
        var end: Date
        /// Set while paused: the countdown freezes at this moment.
        var pausedAt: Date?
    }

    var workoutName: String
}
