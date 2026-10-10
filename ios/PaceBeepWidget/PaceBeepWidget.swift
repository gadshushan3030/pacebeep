import ActivityKit
import AppIntents
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
                        Text(s.detail).font(.system(size: 14, weight: .semibold)).lineLimit(1).minimumScaleFactor(0.75)
                    }
                    Spacer(minLength: 0)
                    countdown(s).font(.display(s.button == nil ? 56 : 48, .compressed))
                }
                HStack(spacing: 14) {
                    Strip(parts: context.attributes.parts, height: 5) { i, _ in
                        Theme.strip(on: s.kind, done: i < s.index, current: i == s.index)
                    }
                    if let button = s.button { next(button, s, background: phase.text, text: phase.background) }
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
                    HStack {
                        Text(s.detail).font(.system(size: 14, weight: .semibold)).foregroundStyle(.secondary)
                            .frame(maxWidth: .infinity, alignment: .leading)
                        if let button = s.button { next(button, s, background: accent, text: .black) }
                    }
                    .padding(.horizontal, 6)
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

    /// Orange to run or lift, light blue to rest, white otherwise (the island is always black).
    private static func accent(_ kind: String) -> Color {
        kind == "work" || kind == "set" ? Theme.signalOnDark : kind == "rest" ? Color(hex: 0x8FB0FF) : .white
    }

    /// iOS redraws this every second on its own; the app only sends a new state per segment.
    /// A part that waits for a tap counts up instead.
    @ViewBuilder
    private func countdown(_ s: WorkoutActivity.ContentState) -> some View {
        Group {
            if let end = s.end {
                Text(timerInterval: s.start...end, pauseTime: s.pausedAt, countsDown: true, showsHours: false)
            } else {
                Text(timerInterval: s.start...s.start.addingTimeInterval(3599), countsDown: false, showsHours: false)
            }
        }
        .monospacedDigit()
        .multilineTextAlignment(.trailing)
    }

    /// Done, Skip or Ready, right from the lock screen.
    private func next(_ label: String, _ s: WorkoutActivity.ContentState, background: Color, text: Color) -> some View {
        Button(intent: NextIntent(index: s.index)) {
            Text(label).font(.system(size: 17, weight: .heavy))
                .frame(minWidth: 84, minHeight: 40)
                .padding(.horizontal, 6)
                .foregroundStyle(text)
                .background(background, in: Capsule())
        }
        .buttonStyle(.plain)
    }
}
