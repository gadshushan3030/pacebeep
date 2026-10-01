import AVFoundation

struct Segment {
    let title: String
    let seconds: Double
    let isWork: Bool
}

struct Workout: Identifiable {
    let name: String
    let segments: [Segment]
    var id: String { name }
    var total: Double { segments.reduce(0) { $0 + $1.seconds } }

    static func intervals(_ name: String, warmup: Double, reps: Int, work: Double, rest: Double, cooldown: Double) -> Workout {
        var s = [Segment(title: "Warm up", seconds: warmup, isWork: false)]
        for i in 1...reps {
            s.append(Segment(title: "Run \(i) of \(reps)", seconds: work, isWork: true))
            if i < reps { s.append(Segment(title: "Rest", seconds: rest, isWork: false)) }
        }
        s.append(Segment(title: "Cool down", seconds: cooldown, isWork: false))
        return Workout(name: name, segments: s)
    }

    static let presets = [
        intervals("Quick test", warmup: 20, reps: 3, work: 20, rest: 10, cooldown: 20),
        intervals("6 × 2:00 / 1:00", warmup: 300, reps: 6, work: 120, rest: 60, cooldown: 300),
    ]

    /// The segment running at time `t` and the seconds left in it.
    func segment(at t: Double) -> (index: Int, segment: Segment, remaining: Double)? {
        var end = 0.0
        for (i, s) in segments.enumerated() {
            end += s.seconds
            if t < end { return (i, s, end - t) }
        }
        return nil
    }

    /// Beeps at exact times; `text` is spoken right after its beep.
    var cues: [Cue] {
        var out: [Cue] = [], t = 0.0
        for s in segments {
            if s.isWork {
                for k in 1...3 where t >= Double(k) { out.append(Cue(time: t - Double(k), beep: .pip, text: nil)) }
            }
            out.append(Cue(time: t, beep: s.isWork ? .go : .rest, text: "\(s.title), \(spoken(s.seconds))"))
            t += s.seconds
        }
        out.append(Cue(time: t, beep: .done, text: "Workout complete"))
        return out.sorted { $0.time < $1.time }
    }
}

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

    /// The whole workout as one audio file: silence with every beep at its exact time.
    /// Playing it keeps the app alive with the screen locked (background audio mode), and the
    /// player's position is the workout clock, so a beep can't drift or come late.
    static func render(_ workout: Workout, to url: URL) throws {
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

        for cue in workout.cues {
            try silence(until: cue.time)
            let buffer = tone(cue.beep, file.processingFormat)
            try file.write(from: buffer)
            cursor += AVAudioFramePosition(buffer.frameLength)
        }
        try silence(until: workout.total + tail)
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

private func spoken(_ seconds: Double) -> String {
    let m = Int(seconds) / 60, s = Int(seconds) % 60
    return [m > 0 ? "\(m) minute\(m == 1 ? "" : "s")" : nil, s > 0 ? "\(s) second\(s == 1 ? "" : "s")" : nil]
        .compactMap { $0 }.joined(separator: " ")
}
