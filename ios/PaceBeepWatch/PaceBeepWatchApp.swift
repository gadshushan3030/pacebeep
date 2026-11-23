import HealthKit
import SwiftUI
import WatchKit

@main
struct PaceBeepWatchApp: App {
    @WKApplicationDelegateAdaptor(AppDelegate.self) private var delegate

    var body: some Scene {
        WindowGroup { WatchView(session: .shared) }
    }
}

/// The phone starts a run with `startWatchApp(with:)`: watchOS launches this app and hands it the
/// configuration here.
final class AppDelegate: NSObject, WKApplicationDelegate {
    func handle(_ workoutConfiguration: HKWorkoutConfiguration) {
        WatchSession.shared.start(workoutConfiguration)
    }
}

struct WatchView: View {
    var session: WatchSession

    var body: some View {
        if session.running {
            VStack(spacing: 8) {
                TimelineView(.periodic(from: .now, by: 1)) { context in
                    Text(clock(session.elapsed(at: context.date)))
                        .font(.system(size: 40, weight: .semibold).monospacedDigit())
                }
                HStack(spacing: 4) {
                    Image(systemName: "heart.fill").foregroundStyle(.red)
                    Text(session.heartRate.map { "\(Int($0))" } ?? "--").font(.title2.monospacedDigit())
                    Text("bpm").font(.footnote).foregroundStyle(.secondary)
                }
                Button("Stop", role: .destructive) { session.stopTapped() }
                    .disabled(session.stopping)
            }
        } else {
            Text("Start a workout in PaceBeep on your iPhone.")
                .multilineTextAlignment(.center)
                .foregroundStyle(.secondary)
        }
    }

    private func clock(_ t: TimeInterval) -> String {
        let s = Int(t)
        return s >= 3600 ? String(format: "%d:%02d:%02d", s / 3600, s / 60 % 60, s % 60) : String(format: "%d:%02d", s / 60, s % 60)
    }
}
