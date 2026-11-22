import HealthKit
import Observation
import WatchConnectivity

/// The workout on the wrist: an `HKWorkoutSession` the phone started, measuring heart rate (and
/// distance outdoors) until the phone says it ended. The phone keeps the segments and the beeps;
/// at the end this sends it the heart-rate readings with their times, and the phone works out
/// each interval's average and max from its own segment times.
///
/// Messages (WCSession dictionaries):
/// - to the phone: `started`, `stop` (Stop tapped here), `stats` (after the end)
/// - from the phone: `end` = true to save the workout, false to drop it (a run under 5 minutes)
@Observable
final class WatchSession: NSObject, HKWorkoutSessionDelegate, HKLiveWorkoutBuilderDelegate, WCSessionDelegate {
    static let shared = WatchSession()

    private(set) var running = false
    private(set) var stopping = false
    private(set) var heartRate: Double?

    @ObservationIgnored private let store = HKHealthStore()
    @ObservationIgnored private var session: HKWorkoutSession?
    @ObservationIgnored private var builder: HKLiveWorkoutBuilder?
    @ObservationIgnored private var keep = true
    /// Heart-rate readings: seconds since 1970, and bpm.
    @ObservationIgnored private var times: [Double] = []
    @ObservationIgnored private var bpms: [Double] = []

    private static let bpm = HKUnit.count().unitDivided(by: .minute())
    private static let heartRateType = HKQuantityType(.heartRate)
    private static let distanceType = HKQuantityType(.distanceWalkingRunning)

    override init() {
        super.init()
        if WCSession.isSupported() {
            WCSession.default.delegate = self
            WCSession.default.activate()
        }
    }

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
                send(["started": true])
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
        if WCSession.default.activationState == .activated, WCSession.default.isReachable {
            WCSession.default.sendMessage(["stop": true], replyHandler: nil) { [weak self] _ in self?.end(keep: true) }
        } else {
            end(keep: true)
        }
    }

    private func end(keep: Bool) {
        guard let session, session.state != .ended, session.state != .stopped else { return }
        self.keep = keep
        stopping = true
        session.end()
    }

    // MARK: HKWorkoutSessionDelegate

    func workoutSession(_ workoutSession: HKWorkoutSession, didChangeTo toState: HKWorkoutSessionState, from fromState: HKWorkoutSessionState, date: Date) {
        guard toState == .ended, let builder else { return }
        Task { @MainActor in
            try? await builder.endCollection(at: date)
            if keep {
                // HealthKit saves the workout itself: it shows in Fitness once.
                _ = try? await builder.finishWorkout()
                var stats: [String: Any] = ["t": times, "bpm": bpms]
                let hr = builder.statistics(for: Self.heartRateType)
                stats["avg"] = hr?.averageQuantity()?.doubleValue(for: Self.bpm)
                stats["max"] = hr?.maximumQuantity()?.doubleValue(for: Self.bpm)
                stats["distance"] = builder.statistics(for: Self.distanceType)?.sumQuantity()?.doubleValue(for: .meter())
                send(["stats": stats])
            } else {
                builder.discardWorkout()
            }
            session = nil
            self.builder = nil
            running = false
            stopping = false
        }
    }

    func workoutSession(_ workoutSession: HKWorkoutSession, didFailWithError error: Error) {}

    // MARK: HKLiveWorkoutBuilderDelegate

    func workoutBuilder(_ workoutBuilder: HKLiveWorkoutBuilder, didCollectDataOf collectedTypes: Set<HKSampleType>) {
        guard collectedTypes.contains(Self.heartRateType), let s = workoutBuilder.statistics(for: Self.heartRateType),
              let q = s.mostRecentQuantity(), let at = s.mostRecentQuantityDateInterval()?.start else { return }
        let value = q.doubleValue(for: Self.bpm)
        DispatchQueue.main.async { [self] in
            heartRate = value
            if times.last != at.timeIntervalSince1970 {
                times.append(at.timeIntervalSince1970)
                bpms.append(value)
            }
        }
    }

    func workoutBuilderDidCollectEvent(_ workoutBuilder: HKLiveWorkoutBuilder) {}

    // MARK: WCSession

    /// Sent at once when the phone is in reach, else queued until it is.
    private func send(_ message: [String: Any]) {
        guard WCSession.default.activationState == .activated else { return }
        if WCSession.default.isReachable {
            WCSession.default.sendMessage(message, replyHandler: nil) { _ in WCSession.default.transferUserInfo(message) }
        } else {
            WCSession.default.transferUserInfo(message)
        }
    }

    private func received(_ message: [String: Any]) {
        guard let keep = message["end"] as? Bool else { return }
        DispatchQueue.main.async { self.end(keep: keep) }
    }

    func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {}
    func session(_ session: WCSession, didReceiveMessage message: [String: Any]) { received(message) }
    func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any] = [:]) { received(userInfo) }
}
