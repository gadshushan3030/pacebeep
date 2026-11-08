import Foundation
import Observation

/// Workouts the assistant planned on the server, and runs and approvals going back to it. All
/// survive having no signal (a gym basement): the last workout list is cached, and runs and
/// approvals wait in an outbox until the server answers. Every run carries a request_id, so
/// sending one twice stores it once.
@MainActor @Observable
final class Coach {
    private(set) var workouts: [Workout] = []
    private(set) var signedIn: Bool
    private(set) var pendingRuns = 0
    private(set) var message: String?
    private(set) var lastSync: Date?
    /// Ask whether to remind: the first time a scheduled or pending workout arrives from the coach.
    var remindersOffer = false

    @ObservationIgnored private let auth = Auth()
    @ObservationIgnored private var outbox: [Upload] = []
    @ObservationIgnored private var approvals: [Approval] = []
    @ObservationIgnored private var flushing = false
    /// The list as the server sent it (plus approvals given here), cached; the reminders follow it.
    @ObservationIgnored private var server: [ServerWorkout] = [] {
        didSet {
            workouts = server.map(\.workout)
            UserDefaults.standard.set(try? JSONEncoder().encode(server), forKey: "workouts")
            Reminders.schedule(workouts)
        }
    }

    init() {
        signedIn = auth.isSignedIn
        if let data = UserDefaults.standard.data(forKey: "workouts") { server = Self.decode(data) }
        workouts = server.map(\.workout)
        if let data = UserDefaults.standard.data(forKey: "outbox") { outbox = (try? JSONDecoder().decode([Upload].self, from: data)) ?? [] }
        if let data = UserDefaults.standard.data(forKey: "approvals") { approvals = (try? JSONDecoder().decode([Approval].self, from: data)) ?? [] }
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
        server = []
    }

    /// Sends waiting runs and approvals, then fetches the workout list.
    func sync() async {
        guard auth.isSignedIn else { return }
        await flush()
        do {
            // blocks=1: full workouts too (an app from before them would fail to decode them).
            let (data, http) = try await auth.send(URLRequest(url: Auth.server.appending(path: "api/workouts").appending(queryItems: [.init(name: "blocks", value: "1")])))
            guard http.statusCode == 200 else { throw URLError(.badServerResponse) }
            server = Self.decode(data)
            lastSync = Date()
            message = nil
            // Once, in context: the coach has planned something with a time, or something to approve.
            if workouts.contains(where: { $0.pending || $0.scheduledTime != nil }), !UserDefaults.standard.bool(forKey: "remindersAsked"),
               await Reminders.center.notificationSettings().authorizationStatus == .notDetermined {
                UserDefaults.standard.set(true, forKey: "remindersAsked")
                remindersOffer = true
            }
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

    /// Approves a workout the coach planned, moved to `time` (HH:MM) when given. Shown approved at
    /// once and sent like a run is; the reminder is scheduled from here, not from the answer.
    func approve(_ workout: Workout, at time: String? = nil) {
        guard let i = server.firstIndex(where: { $0.id == workout.id }) else { return }
        var w = server[i]
        w.status = "approved"
        if let time { w.scheduled_time = time }
        server[i] = w
        approvals.append(Approval(workout_id: workout.id, scheduled_time: time))
        saveOutbox()
        Task { await flush() }
    }

    /// "Remind me" in the offer: the system prompt, then the reminders (denied: none, quietly).
    func enableReminders() async {
        _ = try? await Reminders.center.requestAuthorization(options: [.alert, .sound])
        Reminders.schedule(workouts)
    }

    private func flush() async {
        guard !flushing else { return }
        flushing = true
        defer { flushing = false }
        while let next = approvals.first {
            guard await post("api/workouts/approve", next) else { return }
            approvals.removeFirst()
            saveOutbox()
        }
        while let next = outbox.first {
            guard await post("api/runs", next) else { return }
            outbox.removeFirst()
            saveOutbox()
        }
    }

    /// False when the server could not take it now (offline, signed out, a server error): it is
    /// kept for the next sync. True once stored, or rejected as invalid (resending would never succeed).
    private func post(_ path: String, _ body: some Encodable) async -> Bool {
        var r = URLRequest(url: Auth.server.appending(path: path))
        r.httpMethod = "POST"
        r.setValue("application/json", forHTTPHeaderField: "Content-Type")
        r.httpBody = try? JSONEncoder().encode(body)
        guard let sent = try? await auth.send(r), sent.1.statusCode < 500 else { return false }
        return true
    }

    private func saveOutbox() {
        UserDefaults.standard.set(try? JSONEncoder().encode(outbox), forKey: "outbox")
        UserDefaults.standard.set(try? JSONEncoder().encode(approvals), forKey: "approvals")
        pendingRuns = outbox.count
    }

    private static func decode(_ data: Data) -> [ServerWorkout] {
        (try? JSONDecoder().decode([ServerWorkout].self, from: data)) ?? []
    }
}

/// GET /api/workouts (Codable: the list is cached as it came)
private struct ServerWorkout: Codable {
    let id: String
    let name: String
    let notes: String?
    let warmup_sec: Int
    let repeats: Int?
    let work_sec: Int?
    let rest_sec: Int
    let cooldown_sec: Int
    let target_pace_sec_per_km: Int?
    let blocks: [Block]?
    let scheduled_for: String?
    var scheduled_time: String?
    /// "pending" or "approved" (nil from a server, or a cache, before statuses).
    var status: String?
    let done: Bool

    /// A full workout's part: a strength exercise, or an interval run.
    struct Block: Codable {
        struct Set: Codable {
            let reps: Int?
            let seconds: Int?
            let weight_kg: Double?
        }
        let type: String
        let exercise: String?
        let sets: [Set]?
        let notes: String?
        let warmup_sec: Int?
        let repeats: Int?
        let work_sec: Int?
        let rest_sec: Int?
        let cooldown_sec: Int?
        let target_pace_sec_per_km: Int?
    }

    var workout: Workout {
        var w = blocks.map { Workout(name: name, segments: Self.segments($0), targetPace: $0.lazy.compactMap(\.target_pace_sec_per_km).first) }
            ?? Workout.intervals(name, warmup: Double(warmup_sec), reps: repeats ?? 1, work: Double(work_sec ?? 60),
                                 rest: Double(rest_sec), cooldown: Double(cooldown_sec), pace: target_pace_sec_per_km)
        w.serverId = id
        w.notes = notes
        w.scheduledFor = scheduled_for
        w.scheduledTime = scheduled_time
        w.pending = status == "pending"
        w.done = done
        return w
    }

    /// Each set, with its rest after it (none before a run: its Ready tap is the rest), and a
    /// Ready before a run that follows strength.
    private static func segments(_ blocks: [Block]) -> [Segment] {
        var out: [Segment] = []
        for (b, block) in blocks.enumerated() {
            let next = b + 1 < blocks.count ? blocks[b + 1] : nil
            if block.type == "run" {
                if b > 0, blocks[b - 1].type != "run" { out.append(Segment(kind: .ready, title: "Ready to run", seconds: 0)) }
                out += Workout.run(warmup: Double(block.warmup_sec ?? 0), reps: block.repeats ?? 1, work: Double(block.work_sec ?? 60),
                                   rest: Double(block.rest_sec ?? 0), cooldown: Double(block.cooldown_sec ?? 0), pace: block.target_pace_sec_per_km)
                continue
            }
            let sets = block.sets ?? []
            for (k, set) in sets.enumerated() {
                out.append(Segment(kind: .set, title: "Set \(k + 1) of \(sets.count)", seconds: Double(set.seconds ?? 0),
                                   exercise: block.exercise ?? "Exercise", reps: set.seconds == nil ? set.reps : nil, weight: set.weight_kg, notes: block.notes))
                let last = k == sets.count - 1
                if let rest = block.rest_sec, rest > 0, !(last && (next == nil || next?.type == "run")) {
                    out.append(Segment(kind: .rest, title: "Rest", seconds: Double(rest)))
                }
            }
        }
        return out
    }
}

/// POST /api/workouts/approve: the runner's OK for a workout the coach planned, at a new time if moved.
struct Approval: Codable {
    let workout_id: String
    let scheduled_time: String?
}

/// POST /api/runs: a run recorded by the phone, optionally with the runner's RPE.
struct Upload: Codable {
    struct Interval: Codable {
        let kind: String
        /// nil for a part that waited for a tap.
        let planned_sec: Int?
        let actual_sec: Int
        /// A strength set: planned and done.
        var exercise: String?
        var planned_reps: Int?
        var reps: Int?
        var planned_weight_kg: Double?
        var weight_kg: Double?
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
