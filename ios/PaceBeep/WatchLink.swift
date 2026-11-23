import HealthKit
import WatchConnectivity

/// The PaceBeep Watch app, seen from the phone: started with a run, ended with it, and its heart
/// rate and distance brought back. The phone stays the beeper and the source of truth for segments,
/// so the Watch sends its heart-rate readings with their times and the phone cuts them into
/// intervals by its own segment times (no segment messages during the run).
///
/// The Watch mirrors its workout session here; both sides talk over it (see WatchSession.swift for
/// the messages). WCSession only answers "is a Watch with the app there?".
final class WatchLink: NSObject, HKWorkoutSessionDelegate, WCSessionDelegate {
    static let shared = WatchLink()

    /// What the Watch measured over the run.
    struct Stats {
        var avg: Double?
        var max: Double?
        var distance: Double?
        /// Heart-rate readings: when, and bpm.
        var readings: [(at: Date, bpm: Double)] = []

        /// Average and max bpm of the readings between two times (nil without readings there).
        func heartRate(from: Date, to: Date) -> (avg: Int, max: Int)? {
            let bpm = readings.filter { $0.at >= from && $0.at < to }.map(\.bpm)
            guard let top = bpm.max() else { return nil }
            return (Int((bpm.reduce(0, +) / Double(bpm.count)).rounded()), Int(top.rounded()))
        }
    }

    /// Stop was tapped on the Watch.
    var onStop: () -> Void = {}

    private let store = HKHealthStore()
    /// The Watch app was asked to start a session with this run.
    private var launched = false
    /// The Watch's session, mirrored here once it started.
    private var mirror: HKWorkoutSession?
    private var stats: Stats?
    private var waiting: ((Stats?) -> Void)?

    override init() {
        super.init()
        if WCSession.isSupported() {
            WCSession.default.delegate = self
            WCSession.default.activate()
        }
        // Set at launch, as HealthKit asks: the Watch's session may arrive any time after.
        store.workoutSessionMirroringStartHandler = { [weak self] session in
            DispatchQueue.main.async {
                guard let self else { return }
                session.delegate = self
                self.mirror = session
                // The run already ended (or was never this one's): close the Watch's session now.
                if !self.launched { self.send(["end": false], to: session) }
            }
        }
    }

    /// Opens the Watch app on a workout session, if a Watch with the app is paired. Recorded as a
    /// run, strength training (sets only) or mixed cardio (both); indoors (no GPS) for a treadmill
    /// run as the coach planned it, or strength only.
    func start(_ w: Workout) {
        launched = false
        stats = nil
        waiting = nil
        let s = WCSession.default
        guard HKHealthStore.isHealthDataAvailable(), s.activationState == .activated, s.isPaired, s.isWatchAppInstalled else { return }
        let config = HKWorkoutConfiguration()
        let sets = w.segments.contains { $0.kind == .set }
        let runs = w.segments.contains { [.warmup, .work, .cooldown].contains($0.kind) }
        config.activityType = !runs ? .traditionalStrengthTraining : sets ? .mixedCardio : .running
        config.locationType = w.indoor || !runs ? .indoor : .outdoor
        launched = true
        Task {
            // Asked here once, on the phone (the Watch app shares the answer).
            try? await store.requestAuthorization(toShare: [HKObjectType.workoutType()], read: [HKQuantityType(.heartRate), HKQuantityType(.distanceWalkingRunning)])
            try? await store.startWatchApp(toHandle: config)
        }
    }

    /// Ends the Watch's session: `keep` saves the workout in Health and brings its stats back
    /// (`done` gets them, or nil after 10 s); otherwise the Watch drops it.
    func end(keep: Bool, done: @escaping (Stats?) -> Void = { _ in }) {
        guard launched else { return done(nil) }
        launched = false
        // No mirror yet: the Watch's session (if it starts at all) is closed when it shows up.
        guard let mirror else { return done(nil) }
        send(["end": keep], to: mirror)
        guard keep else { return done(nil) }
        if let stats { return done(stats) }
        waiting = done
        DispatchQueue.main.asyncAfter(deadline: .now() + 10) { [weak self] in self?.deliver(nil) }
    }

    private func deliver(_ stats: Stats?) {
        let done = waiting
        waiting = nil
        done?(stats)
    }

    /// If the message can't reach the Watch, its session is ended from here: the workout is kept,
    /// but the Watch stops (and its stats come back the same way).
    private func send(_ message: [String: Any], to session: HKWorkoutSession) {
        guard let data = try? JSONSerialization.data(withJSONObject: message) else { return }
        Task {
            do { try await session.sendToRemoteWorkoutSession(data: data) } catch { session.end() }
        }
    }

    // MARK: HKWorkoutSessionDelegate (the mirror)

    func workoutSession(_ workoutSession: HKWorkoutSession, didReceiveDataFromRemoteWorkoutSession data: [Data]) {
        let messages = data.compactMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] }
        DispatchQueue.main.async { [self] in
            for message in messages {
                if message["stop"] as? Bool == true { onStop() }
                if let m = message["stats"] as? [String: Any] {
                    let times = m["t"] as? [Double] ?? [], bpm = m["bpm"] as? [Double] ?? []
                    let s = Stats(avg: m["avg"] as? Double, max: m["max"] as? Double, distance: m["distance"] as? Double,
                                  readings: zip(times, bpm).map { (Date(timeIntervalSince1970: $0), $1) })
                    stats = s
                    deliver(s)
                }
            }
        }
    }

    func workoutSession(_ workoutSession: HKWorkoutSession, didChangeTo toState: HKWorkoutSessionState, from fromState: HKWorkoutSessionState, date: Date) {
        guard toState == .ended else { return }
        DispatchQueue.main.async { [self] in
            if mirror === workoutSession { mirror = nil }
        }
    }

    func workoutSession(_ workoutSession: HKWorkoutSession, didFailWithError error: Error) {}

    // MARK: WCSessionDelegate

    func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {}
    func sessionDidBecomeInactive(_ session: WCSession) {}
    func sessionDidDeactivate(_ session: WCSession) { session.activate() }
}
