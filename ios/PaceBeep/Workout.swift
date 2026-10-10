import AVFoundation

struct Segment {
    /// `set`: a strength set. `ready`: before a run that follows strength (getting on the treadmill).
    enum Kind: String { case warmup, work, rest, cooldown, set, ready }

    let kind: Kind
    let title: String
    /// 0 for a part that waits for a tap: a set done by reps, or `ready`.
    let seconds: Double
    /// Target pace for a run, seconds per km.
    var pace: Int?
    /// A strength set's plan.
    var exercise: String?
    var reps: Int?
    var weight: Double?
    var notes: String?

    var isWork: Bool { kind == .work }
    var waits: Bool { seconds == 0 }
    /// Starts with three pips and the high beep.
    var isEffort: Bool { kind == .work || kind == .set }
    /// For the strip and the total: a set done by reps counts as 45 s (a guess, as on the web).
    var length: Double { kind == .set && waits ? 45 : seconds }

    /// What comes next, short: "Lat pulldown · 10 × 50 kg", "run 3 of 6 · 1:00", "the run".
    var next: String {
        if let exercise, let load { return "\(exercise) · \(load)" }
        return kind == .ready ? "the run" : "\(title.lowercased()) · \(clock(seconds))"
    }
    /// A set's load: "10 × 50 kg", "10 reps", "0:45", "0:45 · 20 kg".
    var load: String? {
        guard kind == .set else { return nil }
        if let reps { return weight.map { "\(reps) × \(kg($0)) kg" } ?? "\(reps) reps" }
        return [clock(seconds), weight.map { "\(kg($0)) kg" }].compactMap { $0 }.joined(separator: " · ")
    }

    /// Said with its beep.
    var spoken: String {
        switch kind {
        case .set:
            let what = reps.map { "\($0) reps" } ?? spokenTime(seconds)
            return [exercise, title, what, weight.map { "\(kg($0)) kilos" }].compactMap { $0 }.joined(separator: ", ")
        case .ready:
            return "Next, the run. Tap Ready to start"
        default:
            let pace = isWork ? pace.map { ", pace \($0 / 60):\(String(format: "%02d", $0 % 60))" } ?? "" : ""
            return "\(title), \(spokenTime(seconds))\(pace)"
        }
    }
}

struct Workout: Identifiable {
    let name: String
    let segments: [Segment]
    /// Set for workouts from the server (planned by the assistant).
    var serverId: String?
    var notes: String?
    /// Target pace for the work intervals, seconds per km (a full workout: its first run's).
    var targetPace: Int?
    /// YYYY-MM-DD
    var scheduledFor: String?
    var done = false

    var id: String { serverId ?? name }
    /// Has parts that wait for a tap, so the total is only an estimate.
    var hasWaits: Bool { segments.contains(where: \.waits) }
    var total: Double { segments.reduce(0) { $0 + $1.length } }

    /// Zero-length parts (no warmup, no rest) are left out.
    static func intervals(_ name: String, warmup: Double, reps: Int, work: Double, rest: Double, cooldown: Double, pace: Int? = nil) -> Workout {
        Workout(name: name, segments: run(warmup: warmup, reps: reps, work: work, rest: rest, cooldown: cooldown, pace: pace), targetPace: pace)
    }

    static func run(warmup: Double, reps: Int, work: Double, rest: Double, cooldown: Double, pace: Int?) -> [Segment] {
        var s: [Segment] = []
        if warmup > 0 { s.append(Segment(kind: .warmup, title: "Warm up", seconds: warmup)) }
        for i in 1...reps {
            s.append(Segment(kind: .work, title: "Run \(i) of \(reps)", seconds: work, pace: pace))
            if i < reps, rest > 0 { s.append(Segment(kind: .rest, title: "Rest", seconds: rest)) }
        }
        if cooldown > 0 { s.append(Segment(kind: .cooldown, title: "Cool down", seconds: cooldown)) }
        return s
    }

    /// Target pace "4:30" (per km) and the same as a treadmill speed "13.3" (km/h).
    var pace: String? { targetPace.map(fmtPace) }
    var speed: String? { targetPace.map(fmtSpeed) }
    /// "4:30 /km · 13.3 km/h"
    var paceText: String? { targetPace.map { "\(fmtPace($0)) /km · \(fmtSpeed($0)) km/h" } }

    var parts: [Strip.Part] { segments.map { Strip.Part(kind: $0.kind.rawValue, seconds: Int($0.length)) } }

    func next(after index: Int) -> Segment? { index + 1 < segments.count ? segments[index + 1] : nil }

    /// The line under the title: the target while running, the load in a set, what comes next otherwise.
    func detail(at index: Int) -> String {
        let s = segments[index]
        if s.isWork, let p = s.pace { return "\(fmtPace(p)) /km · \(fmtSpeed(p)) km/h" }
        if s.kind == .set, let load = s.load { return "\(s.title) · \(load)" }
        guard let next = next(after: index) else { return "Last part" }
        return "Next: \(next.next)"
    }

    /// Two minutes to check the beeps with the screen locked.
    static let quickTest = intervals("Quick test", warmup: 20, reps: 3, work: 20, rest: 10, cooldown: 20)

    /// The first part from `index` on that waits for a tap (or the end): what plays from `index`
    /// is one rendered track up to there.
    func stop(after index: Int) -> Int {
        segments[index...].firstIndex(where: \.waits) ?? segments.count
    }

    /// The beeps of the track that plays segments `from..<to`, at exact times from its start, and
    /// the cue that announces `to` (a part that waits, or "Workout complete") at its end; `text`
    /// is spoken right after its beep.
    func cues(from: Int, to: Int) -> [Cue] {
        var out: [Cue] = [], t = 0.0
        for i in from...to {
            guard i < segments.count else {
                out.append(Cue(time: t, beep: .done, text: "Workout complete"))
                break
            }
            let s = segments[i]
            if s.isEffort {
                for k in 1...3 where t >= Double(k) { out.append(Cue(time: t - Double(k), beep: .pip, text: nil)) }
            }
            out.append(Cue(time: t, beep: s.isEffort ? .go : .rest, text: s.spoken))
            t += s.seconds
        }
        return out.sorted { $0.time < $1.time }
    }
}

/// "4:30" and "13.3" for a pace in seconds per km.
func fmtPace(_ secPerKm: Int) -> String { String(format: "%d:%02d", secPerKm / 60, secPerKm % 60) }
func fmtSpeed(_ secPerKm: Int) -> String { String(format: "%.1f", 3600 / Double(secPerKm)) }
/// 50 → "50", 52.5 → "52.5"
func kg(_ weight: Double) -> String { String(format: "%g", weight) }

enum Beep {
    case pip, go, rest, done

    var tone: (hz: Double, seconds: Double) {
        switch self {
        case .pip: (880, 0.12)
        case .go: (1320, 0.5)
        case .rest: (660, 0.6)
        case .done: (1320, 1.2)
        }
    }
}

struct Cue {
    let time: Double
    let beep: Beep
    let text: String?
}

enum CueTrack {
    static let rate = 16_000.0
    /// Silence after the last beep, so "Workout complete" is spoken while the track still plays.
    static let tail = 3.0

    /// A stretch of the workout as one audio file (all of it, unless a part waits for a tap):
    /// silence with every beep at its exact time. Playing it keeps the app alive with the screen
    /// locked (background audio mode), and the player's position is the clock, so a beep can't
    /// drift or come late.
    static func render(_ cues: [Cue], length: Double, to url: URL) throws {
        let file = try AVAudioFile(forWriting: url, settings: [
            AVFormatIDKey: kAudioFormatLinearPCM, AVSampleRateKey: rate, AVNumberOfChannelsKey: 1,
            AVLinearPCMBitDepthKey: 16, AVLinearPCMIsFloatKey: false, AVLinearPCMIsBigEndianKey: false,
        ])
        let quiet = AVAudioPCMBuffer(pcmFormat: file.processingFormat, frameCapacity: AVAudioFrameCount(rate))!
        quiet.floatChannelData![0].update(repeating: 0, count: Int(quiet.frameCapacity))
        var cursor: AVAudioFramePosition = 0

        func silence(until time: Double) throws {
            let end = AVAudioFramePosition(time * rate)
            while cursor < end {
                quiet.frameLength = AVAudioFrameCount(min(end - cursor, AVAudioFramePosition(quiet.frameCapacity)))
                try file.write(from: quiet)
                cursor += AVAudioFramePosition(quiet.frameLength)
            }
        }

        for cue in cues {
            try silence(until: cue.time)
            let buffer = tone(cue.beep, file.processingFormat)
            try file.write(from: buffer)
            cursor += AVAudioFramePosition(buffer.frameLength)
        }
        try silence(until: length + tail)
    }

    private static func tone(_ beep: Beep, _ format: AVAudioFormat) -> AVAudioPCMBuffer {
        let (hz, seconds) = beep.tone
        let n = Int(seconds * rate), fade = rate * 0.01
        let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: AVAudioFrameCount(n))!
        buffer.frameLength = buffer.frameCapacity
        let out = buffer.floatChannelData![0]
        for i in 0..<n {
            let envelope = min(1, Double(i) / fade, Double(n - i) / fade) // 10 ms fades, no clicks
            out[i] = Float(0.8 * envelope * sin(2 * .pi * hz * Double(i) / rate))
        }
        return buffer
    }
}

func clock(_ seconds: Double) -> String {
    let s = Int(seconds)
    return String(format: "%d:%02d", s / 60, s % 60)
}

private func spokenTime(_ seconds: Double) -> String {
    let m = Int(seconds) / 60, s = Int(seconds) % 60
    return [m > 0 ? "\(m) minute\(m == 1 ? "" : "s")" : nil, s > 0 ? "\(s) second\(s == 1 ? "" : "s")" : nil]
        .compactMap { $0 }.joined(separator: " ")
}
