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
            let s = context.state, phase = Theme.phase(s.kind)
            VStack(spacing: 12) {
                HStack(alignment: .center, spacing: 12) {
                    VStack(alignment: .leading, spacing: 3) {
                        HStack(spacing: 6) {
                            PhaseIcon(kind: s.kind, color: phase.text)
                            Text(s.pausedAt == nil ? s.title : "Paused").font(.display(21))
                        }
                        Text(s.detail).font(.system(size: 14, weight: .semibold)).lineLimit(1)
                    }
                    Spacer(minLength: 0)
                    countdown(s).font(.display(56, .compressed))
                }
                Strip(parts: context.attributes.parts, height: 5) { i, _ in
                    Theme.strip(on: s.kind, done: i < s.index, current: i == s.index)
                }
            }
            .foregroundStyle(phase.text)
            .padding(.horizontal, 18)
            .padding(.vertical, 16)
            .activityBackgroundTint(phase.background)
            .activitySystemActionForegroundColor(phase.text)
        } dynamicIsland: { context in
            let s = context.state, accent = Self.accent(s.kind)
            return DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    HStack(spacing: 8) {
                        PhaseIcon(kind: s.kind, color: accent)
                        Text(s.title).font(.display(18))
                    }
                    .padding(.leading, 6)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    countdown(s).font(.display(38, .compressed)).foregroundStyle(accent).padding(.trailing, 6)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    Text(s.detail).font(.system(size: 14, weight: .semibold)).foregroundStyle(.secondary)
                        .frame(maxWidth: .infinity, alignment: .leading).padding(.horizontal, 6)
                }
            } compactLeading: {
                PhaseIcon(kind: s.kind, color: accent)
            } compactTrailing: {
                countdown(s).font(.display(16)).foregroundStyle(accent).frame(maxWidth: 44)
            } minimal: {
                PhaseIcon(kind: s.kind, color: accent)
            }
        }
    }

    /// Orange to run, light blue to rest, white otherwise (the island is always black).
    private static func accent(_ kind: String) -> Color {
        kind == "work" ? Theme.signalOnDark : kind == "rest" ? Color(hex: 0x8FB0FF) : .white
    }

    /// iOS redraws this every second on its own; the app only sends a new state per segment.
    private func countdown(_ s: WorkoutActivity.ContentState) -> some View {
        Text(timerInterval: s.start...s.end, pauseTime: s.pausedAt, countsDown: true, showsHours: false)
            .monospacedDigit()
            .multilineTextAlignment(.trailing)
    }
}
