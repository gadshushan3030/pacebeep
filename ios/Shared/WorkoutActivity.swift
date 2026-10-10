import ActivityKit
import AppIntents
import Foundation

/// The Live Activity on the lock screen and in the Dynamic Island. The app sends one state per
/// segment; iOS ticks the clock from `start` by itself.
struct WorkoutActivity: ActivityAttributes {
    struct ContentState: Codable, Hashable {
        var title: String
        /// "4:30 /km · 13.3 km/h" while running, "Next: run 4 of 6 · 2:00" while resting,
        /// "Set 2 of 4 · 10 reps · 50 kg" in a set.
        var detail: String
        /// warmup, work, rest, cooldown, set or ready: picks the colors.
        var kind: String
        /// The segment running now, for the progress strip.
        var index: Int
        var start: Date
        /// Counts down to `end`; nil counts up from `start` (a part that waits for a tap).
        var end: Date?
        /// Set while paused: the countdown freezes at this moment.
        var pausedAt: Date?
        /// "Done", "Skip" or "Ready": a button that runs NextIntent for `index`.
        var button: String?
    }

    var workoutName: String
    var parts: [Strip.Part]
}

/// The Live Activity's button. iOS runs it in the app's process (waking the app if it has to), so
/// the lock screen moves the workout on without unlocking. `index` is the segment the button was
/// shown for: a tap on a state the app already left does nothing.
struct NextIntent: LiveActivityIntent {
    static let title: LocalizedStringResource = "Next part"
    static let isDiscoverable = false
    /// Set by the app; the widget extension only shows the button.
    nonisolated(unsafe) static var handler: ((Int) -> Void)?

    @Parameter(title: "Part") var index: Int

    init() {}
    init(index: Int) { self.index = index }

    @MainActor
    func perform() async throws -> some IntentResult {
        Self.handler?(index)
        return .result()
    }
}
