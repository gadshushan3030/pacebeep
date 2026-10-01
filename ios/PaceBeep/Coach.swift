import Foundation
import Observation

/// Workouts the assistant planned on the server, and runs going back to it. Both survive having
/// no signal (a gym basement): the last workout list is cached, and runs wait in an outbox until
/// the server answers. Every run carries a request_id, so sending one twice stores it once.
@MainActor @Observable
final class Coach {
    private(set) var workouts: [Workout] = []
    private(set) var signedIn: Bool
    private(set) var pendingRuns = 0
    private(set) var message: String?
    private(set) var lastSync: Date?

    @ObservationIgnored private let auth = Auth()
    @ObservationIgnored private var outbox: [Upload] = []
    @ObservationIgnored private var flushing = false

    init() {
        signedIn = auth.isSignedIn
        if let data = UserDefaults.standard.data(forKey: "workouts") { workouts = Self.decode(data) }
        if let data = UserDefaults.standard.data(forKey: "outbox") { outbox = (try? JSONDecoder().decode([Upload].self, from: data)) ?? [] }
        pendingRuns = outbox.count
    }

    func signIn() async {
        do {
            try await auth.signIn()
            signedIn = true
            message = nil
            await sync()
        } catch {
            message = "Sign-in didn't finish. Try again."
        }
    }

    func signOut() {
        auth.signOut()
        signedIn = false
        workouts = []
        UserDefaults.standard.removeObject(forKey: "workouts")
    }

    /// Sends waiting runs, then fetches the workout list.
    func sync() async {
        guard auth.isSignedIn else { return }
        await flush()
        do {
            let (data, http) = try await auth.send(URLRequest(url: Auth.server.appending(path: "api/workouts")))
            guard http.statusCode == 200 else { throw URLError(.badServerResponse) }
            workouts = Self.decode(data)
            UserDefaults.standard.set(data, forKey: "workouts")
            lastSync = Date()
            message = nil
        } catch {
            signedIn = auth.isSignedIn
            message = signedIn ? "No connection: showing the workouts saved on this phone." : "Signed out. Sign in again to get your workouts."
        }
    }

    /// Queues a run (and later the same run again with the RPE) and tries to send it.
    func upload(_ run: Upload) {
        outbox.append(run)
        saveOutbox()
        Task { await flush() }
    }

    private func flush() async {
        guard !flushing else { return }
        flushing = true
        defer { flushing = false }
        while let next = outbox.first {
            var r = URLRequest(url: Auth.server.appending(path: "api/runs"))
            r.httpMethod = "POST"
            r.setValue("application/json", forHTTPHeaderField: "Content-Type")
            r.httpBody = try? JSONEncoder().encode(next)
            // Offline, signed out or a server error: keep it for the next sync.
            guard let sent = try? await auth.send(r), sent.1.statusCode < 500 else { return }
            outbox.removeFirst() // stored, or rejected as invalid (resending would never succeed)
            saveOutbox()
        }
    }

    private func saveOutbox() {
        UserDefaults.standard.set(try? JSONEncoder().encode(outbox), forKey: "outbox")
        pendingRuns = outbox.count
    }

    private static func decode(_ data: Data) -> [Workout] {
        ((try? JSONDecoder().decode([ServerWorkout].self, from: data)) ?? []).map(\.workout)
    }
}

/// GET /api/workouts
private struct ServerWorkout: Decodable {
    let id: String
    let name: String
    let notes: String?
    let warmup_sec: Int
    let repeats: Int
    let work_sec: Int
    let rest_sec: Int
    let cooldown_sec: Int
    let target_pace_sec_per_km: Int?
    let scheduled_for: String?
    let done: Bool

    var workout: Workout {
        var w = Workout.intervals(name, warmup: Double(warmup_sec), reps: repeats, work: Double(work_sec),
                                  rest: Double(rest_sec), cooldown: Double(cooldown_sec))
        w.serverId = id
        w.notes = notes
        w.targetPace = target_pace_sec_per_km
        w.scheduledFor = scheduled_for
        w.done = done
        return w
    }
}

/// POST /api/runs: a run recorded by the phone, optionally with the runner's RPE.
struct Upload: Codable {
    struct Interval: Codable {
        let kind: String
        let planned_sec: Int
        let actual_sec: Int
    }
    struct Run: Codable {
        let workout_id: String?
        let started_at: String
        let ended_at: String
        let intervals: [Interval]
    }
    struct Feedback: Codable {
        let request_id: String
        let rpe: Int
    }

    let request_id: String
    let run: Run
    var feedback: Feedback?
}
