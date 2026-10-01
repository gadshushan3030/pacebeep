import ActivityKit
import AVFoundation
import Observation

@Observable
final class Runner {
    enum State { case idle, preparing, running, paused, done }

    private(set) var state = State.idle
    private(set) var workout: Workout?
    /// Workout clock: the audio player's position.
    private(set) var elapsed = 0.0
    /// After a run: did the audio play without gaps, and did the voice keep up.
    private(set) var report: [String] = []

    @ObservationIgnored private var player: AVAudioPlayer?
    @ObservationIgnored private var timer: Timer?
    @ObservationIgnored private let synth = AVSpeechSynthesizer()
    @ObservationIgnored private var cues: [Cue] = []
    @ObservationIgnored private var nextCue = 0
    @ObservationIgnored private var startedAt = Date()
    @ObservationIgnored private var pausedAt: Date?
    @ObservationIgnored private var pausedTotal = 0.0
    @ObservationIgnored private var lateness: [Double] = []
    @ObservationIgnored private var interruptions = 0
    @ObservationIgnored private var interrupted = false
    @ObservationIgnored private var activity: Activity<WorkoutActivity>?
    @ObservationIgnored private var shownSegment: Int?

    init() {
        // A phone call or Siri pauses the player; resume when iOS says so.
        NotificationCenter.default.addObserver(forName: AVAudioSession.interruptionNotification, object: nil, queue: .main) { [weak self] note in
            guard let self, let raw = note.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt else { return }
            if AVAudioSession.InterruptionType(rawValue: raw) == .began, state == .running {
                interruptions += 1
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
        report = []
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
        lateness = []
        interruptions = 0
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
        }
        // Voice runs on this timer, beeps are in the track. If iOS froze the app with the screen
        // locked, the beeps would still be on time and the voice would come late (see report).
        while nextCue < cues.count, cues[nextCue].time + cues[nextCue].beep.tone.seconds <= elapsed {
            let cue = cues[nextCue]
            if let text = cue.text {
                lateness.append(elapsed - cue.time - cue.beep.tone.seconds)
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

    func stop() {
        timer?.invalidate()
        player?.stop()
        synth.stopSpeaking(at: .immediate)
        endActivity()
        workout = nil
        state = .idle
    }

    /// Sent on start, at each new segment and on pause/resume; iOS ticks the countdown in between.
    private func updateActivity() {
        guard let workout, let current = workout.segment(at: elapsed) else { return }
        let now = Date()
        let content = ActivityContent(state: WorkoutActivity.ContentState(
            title: current.segment.title,
            isWork: current.segment.isWork,
            start: now - (current.segment.seconds - current.remaining),
            end: now + current.remaining,
            pausedAt: state == .paused ? now : nil
        ), staleDate: nil)
        if let activity {
            Task { await activity.update(content) }
        } else {
            activity = try? Activity.request(attributes: WorkoutActivity(workoutName: workout.name), content: content)
        }
    }

    private func endActivity() {
        let ending = activity
        activity = nil
        Task { await ending?.end(nil, dismissalPolicy: .immediate) }
    }

    private func finish() {
        timer?.invalidate()
        endActivity()
        let wall = Date().timeIntervalSince(startedAt) - pausedTotal
        let audio = player?.duration ?? 0
        let gap = wall - audio
        report = [
            "Real time \(clock(wall)), audio \(clock(audio)): " + (gap < 1 ? "played without gaps" : "audio stopped for \(Int(gap)) s"),
            "Voice: \(lateness.count) of \(cues.filter { $0.text != nil }.count) cues, latest \(String(format: "%.1f", lateness.max() ?? 0)) s late",
            "Interruptions (calls, Siri): \(interruptions)",
        ]
        state = .done
    }

    private func fail(_ error: Error) {
        report = ["Couldn't start: \(error.localizedDescription)"]
        workout = nil
        state = .idle
    }
}
