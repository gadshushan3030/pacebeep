import ActivityKit
import AVFoundation
import Observation

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
        let pauses: Int
        let finished: Bool
        /// Sent to the coach (runs under 5 minutes, like the quick test, are not).
        let recorded: Bool
        /// Seconds the audio stopped while it should have played (iOS froze the app): beeps came late.
        let audioGap: Int
    }

    private(set) var state = State.idle
    private(set) var workout: Workout?
    /// Workout clock: the audio player's position.
    private(set) var elapsed = 0.0
    private(set) var summary: Summary?
    /// The RPE given for the run just recorded.
    private(set) var rating: Int?
    /// Shown when a workout could not start.
    private(set) var error: String?
    /// Where recorded runs go (the coach's outbox).
    @ObservationIgnored var onRun: (Upload) -> Void = { _ in }

    @ObservationIgnored private var player: AVAudioPlayer?
    @ObservationIgnored private var timer: Timer?
    @ObservationIgnored private let synth = AVSpeechSynthesizer()
    @ObservationIgnored private var cues: [Cue] = []
    @ObservationIgnored private var nextCue = 0
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

    func start(_ w: Workout) {
        workout = w
        summary = nil
        rating = nil
        recorded = nil
        error = nil
        state = .preparing
        let url = URL.temporaryDirectory.appending(path: "workout.caf")
        Task.detached(priority: .userInitiated) { [self] in
            do {
                try CueTrack.render(w, to: url)
                await MainActor.run { play(url) }
            } catch {
                await MainActor.run { fail(error) }
            }
        }
    }

    private func play(_ url: URL) {
        do {
            // .playback: keeps playing with the screen locked and the silent switch on.
            // .mixWithOthers: music keeps playing under the beeps. (.duckOthers would lower it for
            // the whole run, since the silence between beeps is playback too.)
            try AVAudioSession.sharedInstance().setCategory(.playback, options: [.mixWithOthers])
            try AVAudioSession.sharedInstance().setActive(true)
            let p = try AVAudioPlayer(contentsOf: url)
            guard p.play() else { throw CocoaError(.featureUnsupported) }
            player = p
        } catch {
            return fail(error)
        }
        cues = workout?.cues ?? []
        nextCue = 0
        elapsed = 0
        pauses = 0
        pausedTotal = 0
        startedAt = Date()
        state = .running
        shownSegment = 0
        updateActivity() // must start while the app is in the foreground
        let t = Timer(timeInterval: 0.2, repeats: true) { [weak self] _ in self?.tick() }
        RunLoop.main.add(t, forMode: .common)
        timer = t
    }

    private func tick() {
        guard state == .running, let player, let workout else { return }
        if !player.isPlaying {
            // The track ended (it resets currentTime to 0, so use the last position).
            if elapsed >= workout.total { finish() }
            return
        }
        elapsed = player.currentTime
        let index = workout.segment(at: elapsed)?.index
        if index != shownSegment {
            shownSegment = index
            if index == nil { endActivity() } else { updateActivity() }
        } else if index != nil, Date().timeIntervalSince(activitySentAt) > 10 {
            // On a phone (not the simulator) an update sent with the screen off can be lost: the
            // lock screen then kept a finished rest at 0:00 through the next run. Resending the
            // same state every 10 s repairs it; its dates are absolute, so resending is harmless.
            updateActivity()
        }
        // Voice runs on this timer, beeps are in the track.
        while nextCue < cues.count, cues[nextCue].time + cues[nextCue].beep.tone.seconds <= elapsed {
            if let text = cues[nextCue].text {
                let u = AVSpeechUtterance(string: text)
                u.voice = AVSpeechSynthesisVoice(language: "en-US")
                synth.speak(u)
            }
            nextCue += 1
        }
    }

    func pause() {
        player?.pause()
        pausedAt = Date()
        pauses += 1
        state = .paused
        elapsed = player?.currentTime ?? elapsed
        updateActivity()
    }

    func resume() {
        if let pausedAt { pausedTotal += Date().timeIntervalSince(pausedAt) }
        pausedAt = nil
        try? AVAudioSession.sharedInstance().setActive(true)
        player?.play()
        state = .running
        elapsed = player?.currentTime ?? elapsed
        updateActivity()
    }

    /// Stopping after 5 minutes keeps the run (and asks for the RPE); earlier, it's dropped.
    func stop() {
        timer?.invalidate()
        if let pausedAt { pausedTotal += Date().timeIntervalSince(pausedAt) }
        pausedAt = nil
        elapsed = player?.currentTime ?? elapsed
        player?.stop()
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
        endActivity()
        wrapUp(finished: true)
    }

    private func wrapUp(finished: Bool) {
        guard let workout else { return }
        let wall = Date().timeIntervalSince(startedAt) - pausedTotal
        let reps = workout.segments.filter(\.isWork)
        var start = 0.0, repsDone = 0
        for s in workout.segments {
            if s.isWork, start + s.seconds <= elapsed + 0.5 { repsDone += 1 }
            start += s.seconds
        }
        let audio = finished ? (player?.duration ?? 0) : elapsed
        record()
        summary = Summary(
            workout: workout, startedAt: startedAt, seconds: wall, repsDone: repsDone, reps: reps.count,
            pauses: pauses, finished: finished, recorded: recorded != nil, audioGap: max(0, Int(wall - audio))
        )
        state = .done
    }

    /// Sends the run to the coach: every segment reached, with the time actually spent in it.
    /// Runs shorter than 5 minutes (the quick test, an accidental start) are not sent.
    private func record() {
        guard let workout, elapsed >= 300 else { return }
        var start = 0.0
        var intervals: [Upload.Interval] = []
        for s in workout.segments where start < elapsed {
            intervals.append(.init(kind: s.kind.rawValue, planned_sec: Int(s.seconds), actual_sec: Int(min(s.seconds, elapsed - start))))
            start += s.seconds
        }
        let iso = ISO8601DateFormatter()
        let run = Upload(request_id: UUID().uuidString, run: .init(
            workout_id: workout.serverId,
            started_at: iso.string(from: startedAt),
            ended_at: iso.string(from: Date()),
            intervals: intervals
        ))
        onRun(run)
        recorded = run
    }

    /// Sent on start, at each new segment and on pause/resume; iOS ticks the countdown in between.
    private func updateActivity() {
        guard let workout, let current = workout.segment(at: elapsed) else { return }
        let now = Date()
        let content = ActivityContent(state: WorkoutActivity.ContentState(
            title: current.segment.title,
            detail: workout.detail(at: current.index),
            kind: current.segment.kind.rawValue,
            index: current.index,
            start: now - (current.segment.seconds - current.remaining),
            end: now + current.remaining,
            pausedAt: state == .paused ? now : nil
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
        workout = nil
        state = .idle
    }
}
