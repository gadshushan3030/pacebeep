import ActivityKit
import AVFoundation
import Observation

/// Plays a workout. Timed parts play as rendered tracks (beeps at exact times, the player's
/// position is the clock); a part that waits for a tap (a set done by reps, getting ready to run)
/// ends a track, and the tap renders and plays the next stretch. A silent loop plays under it all,
/// so the app stays alive with the screen locked also while nothing is counting.
@Observable
final class Runner {
    enum State { case idle, preparing, running, paused, done }

    /// What the after-the-run screen shows.
    struct Summary {
        let workout: Workout
        let startedAt: Date
        /// Time running, pauses left out.
        let seconds: Double
        let repsDone: Int
        let reps: Int
        let setsDone: Int
        let sets: Int
        let pauses: Int
        let finished: Bool
        /// Segments reached, for the strip.
        let reached: Int
        /// Sent to the coach (runs under 5 minutes, like the quick test, are not).
        let recorded: Bool
        /// Seconds nothing counted while it should have (iOS froze the app): beeps came late.
        let audioGap: Int
    }

    /// A set's reps and weight as done: the plan until changed.
    struct SetLog: Equatable {
        var reps: Int?
        var weight: Double?
    }

    private(set) var state = State.idle
    private(set) var workout: Workout?
    /// The segment now: playing, or waiting for a tap. `segments.count` once the last one is over.
    private(set) var index = 0
    /// A timed segment: seconds left in it.
    private(set) var remaining = 0.0
    /// A segment that waits: seconds since it began.
    private(set) var waited = 0.0
    /// Time in the workout, pauses left out.
    private(set) var elapsed = 0.0
    private(set) var summary: Summary?
    /// The RPE given for the run just recorded.
    private(set) var rating: Int?
    /// Shown when a workout could not start.
    private(set) var error: String?
    /// Sets whose reps or weight were changed, by segment index.
    private(set) var logs: [Int: SetLog] = [:]
    /// Where recorded runs go (the coach's outbox).
    @ObservationIgnored var onRun: (Upload) -> Void = { _ in }

    @ObservationIgnored private var hold: AVAudioPlayer?
    @ObservationIgnored private var player: AVAudioPlayer?
    @ObservationIgnored private var timer: Timer?
    @ObservationIgnored private let synth = AVSpeechSynthesizer()
    /// The segments the current track plays, and when each starts on its clock. Its upper bound is
    /// the part announced at its end: one that waits, or the end of the workout.
    @ObservationIgnored private var track = 0..<0
    @ObservationIgnored private var starts: [Double] = []
    @ObservationIgnored private var trackClock = 0.0
    @ObservationIgnored private var cues: [Cue] = []
    @ObservationIgnored private var nextCue = 0
    /// A track is being rendered; `generation` drops one that a tap or a stop made stale.
    @ObservationIgnored private var loading = false
    @ObservationIgnored private var loadingSince = Date()
    /// Seconds from a tap to its track playing: nothing counts then, and that's not a gap.
    @ObservationIgnored private var latency = 0.0
    @ObservationIgnored private var generation = 0
    /// The next track, rendered while a part waits, so a tap starts it at once.
    @ObservationIgnored private var prepared: (from: Int, task: Task<URL, Error>)?
    /// Seconds actually spent in segments that ended early or waited; others took their planned time.
    @ObservationIgnored private var spent: [Int: Double] = [:]
    @ObservationIgnored private var waitStart = Date()
    /// The set just done and when it began, for "Back to set".
    @ObservationIgnored private var lastSet: (index: Int, start: Date)?
    @ObservationIgnored private var startedAt = Date()
    @ObservationIgnored private var pausedAt: Date?
    @ObservationIgnored private var pausedTotal = 0.0
    @ObservationIgnored private var pauses = 0
    @ObservationIgnored private var interrupted = false
    @ObservationIgnored private var recorded: Upload?
    @ObservationIgnored private var activity: Activity<WorkoutActivity>?
    @ObservationIgnored private var shownSegment: Int?
    @ObservationIgnored private var activitySentAt = Date.distantPast

    init() {
        // A phone call or Siri pauses the player; resume when iOS says so.
        NotificationCenter.default.addObserver(forName: AVAudioSession.interruptionNotification, object: nil, queue: .main) { [weak self] note in
            guard let self, let raw = note.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt else { return }
            if AVAudioSession.InterruptionType(rawValue: raw) == .began, state == .running {
                interrupted = true
                pause()
            } else if AVAudioSession.InterruptionType(rawValue: raw) == .ended, interrupted {
                interrupted = false
                let options = note.userInfo?[AVAudioSessionInterruptionOptionKey] as? UInt ?? 0
                if AVAudioSession.InterruptionOptions(rawValue: options).contains(.shouldResume) { resume() }
            }
        }
    }

    var current: Segment? { workout.flatMap { index < $0.segments.count ? $0.segments[index] : nil } }

    func start(_ w: Workout) {
        workout = w
        summary = nil
        rating = nil
        recorded = nil
        error = nil
        logs = [:]
        spent = [:]
        lastSet = nil
        prepared = nil
        index = 0
        state = .preparing
        do {
            // .playback: keeps playing with the screen locked and the silent switch on.
            // .mixWithOthers: music keeps playing under the beeps. (.duckOthers would lower it for
            // the whole run, since the silence between beeps is playback too.)
            try AVAudioSession.sharedInstance().setCategory(.playback, options: [.mixWithOthers])
            try AVAudioSession.sharedInstance().setActive(true)
            let url = URL.temporaryDirectory.appending(path: "hold.caf")
            try CueTrack.render([], length: 0, to: url)
            let h = try AVAudioPlayer(contentsOf: url)
            h.numberOfLoops = -1
            guard h.play() else { throw CocoaError(.featureUnsupported) }
            hold = h
        } catch {
            return fail(error)
        }
        pauses = 0
        pausedTotal = 0
        latency = 0
        play(from: 0)
    }

    /// Done (a set), Skip (a rest before a set) or Ready (before a run): the button for segment `i`,
    /// in the app or on the Live Activity. A tap on a state already gone does nothing.
    func advance(from i: Int) {
        guard state == .running, i == index, let s = current, !loading else { return }
        if s.waits {
            spent[i] = Date().timeIntervalSince(waitStart)
            lastSet = s.kind == .set ? (i, waitStart) : nil
        } else {
            guard canSkip else { return }
            spent[i] = trackClock - starts[i - track.lowerBound]
        }
        play(from: i + 1)
    }

    /// A rest before a set (not one between runs).
    var canSkip: Bool {
        guard current?.kind == .rest, let next = workout?.next(after: index) else { return false }
        return next.kind == .set || next.waits
    }

    /// In the rest right after a set: Done was tapped by mistake.
    var canGoBack: Bool { state == .running && current?.kind == .rest && lastSet?.index == index - 1 }

    /// Back to the set just done; its time goes on from when it began.
    func backToSet() {
        guard canGoBack, let lastSet else { return }
        stopTrack()
        spent[lastSet.index] = nil
        index = lastSet.index
        track = index..<index
        starts = []
        trackClock = 0
        wait(since: lastSet.start)
        self.lastSet = nil
    }

    /// A set's reps and weight as done so far.
    func log(_ i: Int) -> SetLog {
        logs[i] ?? SetLog(reps: workout?.segments[i].reps, weight: workout?.segments[i].weight)
    }

    func change(_ i: Int, reps: Int = 0, weight: Double = 0) {
        var l = log(i)
        l.reps = l.reps.map { max(0, $0 + reps) }
        l.weight = l.weight.map { max(0, $0 + weight) }
        logs[i] = l
    }

    /// Renders and plays the segments from `i` up to the next part that waits (announcing it at
    /// the end); prepared ahead while the previous part waited.
    private func play(from i: Int) {
        guard let workout else { return }
        stopTrack()
        let to = i < workout.segments.count ? workout.stop(after: i) : i
        let task = prepared?.from == i ? prepared!.task : render(from: i, to: to)
        prepared = nil
        generation += 1
        let g = generation
        index = i
        track = i..<to
        var t = 0.0
        starts = workout.segments[i..<to].map { s in defer { t += s.seconds }; return t }
        trackClock = 0
        remaining = current?.seconds ?? 0
        cues = workout.cues(from: i, to: to)
        nextCue = 0
        loading = true
        loadingSince = Date()
        Task {
            do {
                let url = try await task.value
                await MainActor.run { start(url, generation: g) }
            } catch {
                await MainActor.run { fail(error) }
            }
        }
    }

    private func render(from i: Int, to: Int) -> Task<URL, Error> {
        let w = workout!
        let url = URL.temporaryDirectory.appending(path: "part-\(i).caf")
        return Task.detached(priority: .userInitiated) {
            try CueTrack.render(w.cues(from: i, to: to), length: w.segments[i..<to].reduce(0) { $0 + $1.seconds }, to: url)
            return url
        }
    }

    private func start(_ url: URL, generation g: Int) {
        guard g == generation, state == .preparing || state == .running else { return }
        loading = false
        if state == .running { latency += Date().timeIntervalSince(loadingSince) }
        do {
            let p = try AVAudioPlayer(contentsOf: url)
            guard p.play() else { throw CocoaError(.featureUnsupported) }
            player = p
        } catch {
            return fail(error)
        }
        if state == .preparing {
            startedAt = Date()
            state = .running
            let t = Timer(timeInterval: 0.2, repeats: true) { [weak self] _ in self?.tick() }
            RunLoop.main.add(t, forMode: .common)
            timer = t
        }
        shownSegment = nil
        if track.isEmpty, current?.waits == true { wait(since: Date()) }
        tick()
    }

    private func stopTrack() {
        generation += 1
        loading = false
        player?.stop()
        player = nil
        cues = []
    }

    private func tick() {
        guard state == .running, let workout else { return }
        elapsed = Date().timeIntervalSince(startedAt) - pausedTotal
        if let player {
            if player.isPlaying {
                trackClock = player.currentTime
            } else {
                // The track ended (it resets currentTime to 0, so keep the last position).
                self.player = nil
                if track.upperBound == workout.segments.count { return finish() }
            }
        }
        if !loading, index < workout.segments.count, !workout.segments[index].waits {
            // Where the track's clock is: in one of its segments, or past them all.
            var i = track.upperBound
            remaining = 0
            for (k, start) in starts.enumerated() where trackClock < start + workout.segments[track.lowerBound + k].seconds {
                i = track.lowerBound + k
                remaining = start + workout.segments[i].seconds - trackClock
                break
            }
            index = i
            if i == track.upperBound, i < workout.segments.count {
                wait(since: Date() - (trackClock - (starts.last.map { $0 + workout.segments[i - 1].seconds } ?? 0)))
            }
        }
        if let s = current, s.waits { waited = Date().timeIntervalSince(waitStart) }
        if index != shownSegment {
            shownSegment = index
            if index == workout.segments.count { endActivity() } else { updateActivity() }
        } else if index < workout.segments.count, Date().timeIntervalSince(activitySentAt) > 10 {
            // On a phone (not the simulator) an update sent with the screen off can be lost: the
            // lock screen then kept a finished rest at 0:00 through the next run. Resending the
            // same state every 10 s repairs it; its dates are absolute, so resending is harmless.
            updateActivity()
        }
        // Voice runs on this timer, beeps are in the track.
        while nextCue < cues.count, cues[nextCue].time + cues[nextCue].beep.tone.seconds <= trackClock {
            if let text = cues[nextCue].text {
                let u = AVSpeechUtterance(string: text)
                u.voice = AVSpeechSynthesisVoice(language: "en-US")
                synth.speak(u)
            }
            nextCue += 1
        }
    }

    /// A part that waits for a tap began at `start`; the next track renders meanwhile.
    private func wait(since start: Date) {
        waitStart = start
        waited = Date().timeIntervalSince(start)
        if let workout, index + 1 <= workout.segments.count, prepared?.from != index + 1 {
            let from = index + 1
            prepared = (from, render(from: from, to: from < workout.segments.count ? workout.stop(after: from) : from))
        }
        updateActivity()
    }

    /// Only a timed part pauses; a part that waits is already waiting.
    func pause() {
        guard state == .running else { return }
        player?.pause()
        pausedAt = Date()
        pauses += 1
        state = .paused
        trackClock = player?.currentTime ?? trackClock
        updateActivity()
    }

    func resume() {
        if let pausedAt { pausedTotal += Date().timeIntervalSince(pausedAt) }
        pausedAt = nil
        try? AVAudioSession.sharedInstance().setActive(true)
        hold?.play()
        player?.play()
        state = .running
        trackClock = player?.currentTime ?? trackClock
        updateActivity()
    }

    /// Stopping after 5 minutes keeps the run (and asks for the RPE); earlier, it's dropped.
    func stop() {
        timer?.invalidate()
        if let pausedAt { pausedTotal += Date().timeIntervalSince(pausedAt) }
        pausedAt = nil
        trackClock = player?.currentTime ?? trackClock
        elapsed = Date().timeIntervalSince(startedAt) - pausedTotal
        stopTrack()
        hold?.stop()
        synth.stopSpeaking(at: .immediate)
        endActivity()
        if elapsed >= 300 {
            wrapUp(finished: false)
        } else {
            workout = nil
            state = .idle
        }
    }

    /// Back to the home screen from the after-the-run screen.
    func dismiss() {
        workout = nil
        summary = nil
        state = .idle
    }

    /// The runner's RPE (1-10) for the run just recorded: the same run again, with feedback.
    func rate(_ rpe: Int) {
        guard rating == nil, var run = recorded else { return }
        run.feedback = Upload.Feedback(request_id: UUID().uuidString, rpe: rpe)
        onRun(run)
        rating = rpe
    }

    private func finish() {
        timer?.invalidate()
        elapsed = Date().timeIntervalSince(startedAt) - pausedTotal
        hold?.stop()
        endActivity()
        wrapUp(finished: true)
    }

    private func wrapUp(finished: Bool) {
        guard let workout else { return }
        let segments = workout.segments
        // The end's "Workout complete" plays after the last segment, inside the track.
        let counted = record() + latency + (finished ? CueTrack.tail : 0)
        let done = segments.indices.filter { $0 < index }
        summary = Summary(
            workout: workout, startedAt: startedAt, seconds: elapsed,
            repsDone: done.filter { segments[$0].kind == .work }.count, reps: segments.filter { $0.kind == .work }.count,
            setsDone: done.filter { segments[$0].kind == .set }.count, sets: segments.filter { $0.kind == .set }.count,
            pauses: pauses, finished: finished, reached: min(index + (finished ? 0 : 1), segments.count),
            recorded: recorded != nil, audioGap: max(0, Int(elapsed - counted))
        )
        state = .done
    }

    /// Every segment done with the time spent in it, and the one stopped in if it was counting.
    /// Sent to the coach unless shorter than 5 minutes (the quick test, an accidental start).
    /// Returns the seconds the segments account for.
    private func record() -> Double {
        guard let workout else { return 0 }
        var intervals: [Upload.Interval] = []
        var counted = 0.0
        for (i, s) in workout.segments.enumerated() where i <= index {
            let seconds: Double
            if i < index {
                seconds = spent[i] ?? s.seconds
            } else if !s.waits, track.contains(i), trackClock > starts[i - track.lowerBound] {
                seconds = trackClock - starts[i - track.lowerBound]
            } else {
                continue
            }
            counted += seconds
            let set = s.kind == .set ? log(i) : nil
            intervals.append(.init(
                kind: s.kind == .ready ? "rest" : s.kind.rawValue, planned_sec: s.waits ? nil : Int(s.seconds), actual_sec: Int(seconds),
                exercise: s.exercise, planned_reps: s.reps, reps: set?.reps, planned_weight_kg: s.weight, weight_kg: set?.weight
            ))
        }
        guard elapsed >= 300 else { return counted }
        let iso = ISO8601DateFormatter()
        let run = Upload(request_id: UUID().uuidString, run: .init(
            workout_id: workout.serverId,
            started_at: iso.string(from: startedAt),
            ended_at: iso.string(from: Date()),
            intervals: intervals
        ))
        onRun(run)
        recorded = run
        return counted
    }

    /// Sent at each new segment and on pause/resume; iOS ticks the clock in between.
    private func updateActivity() {
        guard let workout, let s = current else { return }
        let now = Date()
        let button: String? = s.waits ? (s.kind == .set ? "Done" : "Ready") : canSkip ? "Skip" : nil
        let content = ActivityContent(state: WorkoutActivity.ContentState(
            title: s.exercise ?? s.title,
            detail: workout.detail(at: index),
            kind: s.kind.rawValue,
            index: index,
            start: s.waits ? waitStart : now - (s.seconds - remaining),
            end: s.waits ? nil : now + remaining,
            pausedAt: state == .paused ? now : nil,
            button: state == .running ? button : nil
        ), staleDate: nil)
        activitySentAt = now
        if let activity {
            Task { await activity.update(content) }
        } else {
            let attributes = WorkoutActivity(workoutName: workout.name, parts: workout.parts)
            activity = try? Activity.request(attributes: attributes, content: content)
        }
    }

    private func endActivity() {
        let ending = activity
        activity = nil
        Task { await ending?.end(nil, dismissalPolicy: .immediate) }
    }

    private func fail(_ error: Error) {
        self.error = "Couldn't start: \(error.localizedDescription)"
        timer?.invalidate()
        stopTrack()
        hold?.stop()
        endActivity()
        workout = nil
        state = .idle
    }
}
