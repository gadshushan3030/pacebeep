import ActivityKit
import Foundation

/// The Live Activity on the lock screen and in the Dynamic Island. The app sends one state per
/// segment; iOS ticks the countdown from `start...end` by itself.
struct WorkoutActivity: ActivityAttributes {
    struct ContentState: Codable, Hashable {
        var title: String
        /// "4:30 /km · 13.3 km/h" while running, "Next: run 4 of 6 · 2:00" while resting.
        var detail: String
        /// warmup, work, rest or cooldown: picks the colors.
        var kind: String
        /// The segment running now, for the progress strip.
        var index: Int
        var start: Date
        var end: Date
        /// Set while paused: the countdown freezes at this moment.
        var pausedAt: Date?
    }

    var workoutName: String
    var parts: [Strip.Part]
}
