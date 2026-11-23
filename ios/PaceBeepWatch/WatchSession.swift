import HealthKit
import Observation

/// The workout on the wrist: an `HKWorkoutSession` the phone started, measuring heart rate (and
/// distance outdoors) until the phone says it ended. The phone keeps the segments and the beeps;
/// at the end this sends it the heart-rate readings with their times, and the phone works out
/// each interval's average and max from its own segment times.
///
/// The session is mirrored to the phone (HealthKit's own link, which works with the phone locked),
/// and the two talk over it with small JSON dictionaries:
/// - to the phone: `stop` (Stop tapped here), `stats` (after the end, before the session closes)
/// - from the phone: `end` = true to save the workout, false to drop it (a run under 5 minutes)
@Observable
final class WatchSession: NSObject, HKWorkoutSessionDelegate, HKLiveWorkoutBuilderDelegate {
    static let shared = WatchSession()

    private(set) var running = false
    private(set) var stopping = false
    private(set) var heartRate: Double?

    @ObservationIgnored private let store = HKHealthStore()
    @ObservationIgnored private var session: HKWorkoutSession?
    @ObservationIgnored private var builder: HKLiveWorkoutBuilder?
    @ObservationIgnored private var keep = true
    /// Heart-rate readings: seconds since 1970, and bpm.
    @ObservationIgnored private var times: [Int] = []
    @ObservationIgnored private var bpms: [Int] = []

    private static let bpm = HKUnit.count().unitDivided(by: .minute())
    private static let heartRateType = HKQuantityType(.heartRate)
    private static let distanceType = HKQuantityType(.distanceWalkingRunning)

    func elapsed(at date: Date) -> TimeInterval { builder?.elapsedTime(at: date) ?? 0 }

    func start(_ configuration: HKWorkoutConfiguration) {
        guard session == nil else { return }
        Task { @MainActor in
            try? await store.requestAuthorization(toShare: [HKObjectType.workoutType()], read: [Self.heartRateType, Self.distanceType])
            do {
                let session = try HKWorkoutSession(healthStore: store, configuration: configuration)
                let builder = session.associatedWorkoutBuilder()
                builder.dataSource = HKLiveWorkoutDataSource(healthStore: store, workoutConfiguration: configuration)
                session.delegate = self
                builder.delegate = self
                self.session = session
                self.builder = builder
                times = []
                bpms = []
                heartRate = nil
                keep = true
                stopping = false
                let now = Date()
                session.startActivity(with: now)
                try await builder.beginCollection(at: now)
                running = true
                try? await session.startMirroringToCompanionDevice()
            } catch {
                session = nil
                builder = nil
            }
        }
    }

    /// Stop on the wrist stops the run on the phone, which then ends this session like any other
    /// end. Without the phone in reach, it ends here and keeps the workout.
    func stopTapped() {
        stopping = true
        Task { @MainActor in
            if await !send(["stop": true]) { end(keep: true) }
        }
    }

    /// Stops measuring; the rest happens as the session changes state (below).
    @MainActor private func end(keep: Bool) {
        guard let session, session.state == .running || session.state == .paused else { return }
        self.keep = keep
        stopping = true
        session.stopActivity(with: Date())
    }

    // MARK: HKWorkoutSessionDelegate

    /// Stopped: collection ends and the stats go to the phone while the mirror is still up; then
    /// the session ends, and HealthKit saves the workout (it shows in Fitness once) or drops it.
    func workoutSession(_ workoutSession: HKWorkoutSession, didChangeTo toState: HKWorkoutSessionState, from fromState: HKWorkoutSessionState, date: Date) {
        Task { @MainActor in
            guard let builder, workoutSession === session else { return }
            switch toState {
            case .stopped:
                try? await builder.endCollection(at: date)
                if keep {
                    var stats: [String: Any] = ["t": times, "bpm": bpms]
                    let hr = builder.statistics(for: Self.heartRateType)
                    stats["avg"] = hr?.averageQuantity()?.doubleValue(for: Self.bpm)
                    stats["max"] = hr?.maximumQuantity()?.doubleValue(for: Self.bpm)
                    stats["distance"] = builder.statistics(for: Self.distanceType)?.sumQuantity()?.doubleValue(for: .meter())
                    await send(["stats": stats])
                }
                workoutSession.end()
            case .ended:
                // Ended straight from running (the phone ended the mirror): collection too.
                try? await builder.endCollection(at: date)
                if keep {
                    _ = try? await builder.finishWorkout()
                } else {
                    builder.discardWorkout()
                }
                session = nil
                self.builder = nil
                running = false
                stopping = false
            default:
                break
            }
        }
    }

    func workoutSession(_ workoutSession: HKWorkoutSession, didFailWithError error: Error) {}

    func workoutSession(_ workoutSession: HKWorkoutSession, didReceiveDataFromRemoteWorkoutSession data: [Data]) {
        for d in data {
            guard let message = try? JSONSerialization.jsonObject(with: d) as? [String: Any],
                  let keep = message["end"] as? Bool else { continue }
            Task { @MainActor in end(keep: keep) }
        }
    }

    // MARK: HKLiveWorkoutBuilderDelegate

    func workoutBuilder(_ workoutBuilder: HKLiveWorkoutBuilder, didCollectDataOf collectedTypes: Set<HKSampleType>) {
        guard collectedTypes.contains(Self.heartRateType), let s = workoutBuilder.statistics(for: Self.heartRateType),
              let q = s.mostRecentQuantity(), let at = s.mostRecentQuantityDateInterval()?.start else { return }
        let value = q.doubleValue(for: Self.bpm)
        DispatchQueue.main.async { [self] in
            heartRate = value
            let t = Int(at.timeIntervalSince1970)
            if times.last != t {
                times.append(t)
                bpms.append(Int(value.rounded()))
            }
        }
    }

    func workoutBuilderDidCollectEvent(_ workoutBuilder: HKLiveWorkoutBuilder) {}

    /// To the phone over the mirrored session; false if it didn't get there.
    @MainActor @discardableResult private func send(_ message: [String: Any]) async -> Bool {
        guard let session, let data = try? JSONSerialization.data(withJSONObject: message) else { return false }
        do {
            try await session.sendToRemoteWorkoutSession(data: data)
            return true
        } catch {
            return false
        }
    }
}
