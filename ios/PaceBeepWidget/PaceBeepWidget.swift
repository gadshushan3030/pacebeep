import ActivityKit
import SwiftUI
import WidgetKit

@main
struct PaceBeepWidgets: WidgetBundle {
    var body: some Widget { WorkoutLiveActivity() }
}

struct WorkoutLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: WorkoutActivity.self) { context in
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Label(context.state.title, systemImage: icon(context.state)).font(.title3.bold())
                    Text(context.state.pausedAt == nil ? context.attributes.workoutName : "Paused")
                        .font(.subheadline).opacity(0.8)
                }
                Spacer()
                countdown(context.state).font(.system(size: 44, weight: .bold, design: .rounded))
            }
            .foregroundStyle(.white)
            .padding()
            .activityBackgroundTint(context.state.isWork ? .orange : Color(white: 0.15))
            .activitySystemActionForegroundColor(.white)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Label(context.state.title, systemImage: icon(context.state)).font(.headline)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    countdown(context.state).font(.title2.bold())
                }
            } compactLeading: {
                Image(systemName: icon(context.state)).foregroundStyle(context.state.isWork ? .orange : .white)
            } compactTrailing: {
                countdown(context.state).frame(maxWidth: 48)
            } minimal: {
                Image(systemName: icon(context.state))
            }
        }
    }

    private func icon(_ s: WorkoutActivity.ContentState) -> String {
        s.isWork ? "figure.run" : "figure.walk"
    }

    /// iOS redraws this every second on its own; the app only sends a new state per segment.
    private func countdown(_ s: WorkoutActivity.ContentState) -> some View {
        Text(timerInterval: s.start...s.end, pauseTime: s.pausedAt, countsDown: true, showsHours: false)
            .monospacedDigit()
            .multilineTextAlignment(.trailing)
    }
}
