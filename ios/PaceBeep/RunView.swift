import SwiftUI

/// The run: the whole screen takes the phase's color (orange to run or lift, blue to rest, ink to
/// warm up, cool down and get ready), with the clock as big as it fits. A set done by reps shows
/// its load and a Done button instead of a countdown.
struct RunView: View {
    let runner: Runner
    @State private var confirmStop = false

    var body: some View {
        if let w = runner.workout {
            let index = runner.index
            let current = runner.current
            let kind = current?.kind.rawValue ?? "cooldown"
            let phase = Theme.phase(kind)
            let next = w.next(after: index)
            VStack(spacing: 0) {
                HStack {
                    Text(runner.state == .paused ? "Paused" : current?.title ?? "Finishing").eyebrow(phase.text, size: 15)
                    Spacer()
                    Text(w.hasWaits ? clock(runner.elapsed) : "\(clock(runner.elapsed)) / \(clock(w.total))")
                        .font(.system(size: 15, weight: .bold)).monospacedDigit()
                }
                Spacer(minLength: 12)
                if let current, current.waits {
                    if current.kind == .set { set(current, index) } else { ready(w, index) }
                } else {
                    if let exercise = current?.exercise {
                        Text(exercise).font(.display(30)).lineLimit(1).minimumScaleFactor(0.6)
                    }
                    // Rounded up, so the pips before a run land on 3, 2, 1.
                    Text(clock(runner.remaining.rounded(.up)))
                        .font(.display(210, .compressed)).monospacedDigit()
                        .lineLimit(1).minimumScaleFactor(0.4)
                        .accessibilityLabel("\(Int(runner.remaining.rounded(.up))) seconds left")
                    Text(subtitle(kind)).font(.system(size: 16, weight: .semibold))
                }
                Spacer(minLength: 12)
                if kind == "work", let pace = current?.pace {
                    HStack(spacing: 12) {
                        statBox("Target pace", fmtPace(pace), "/km", phase.text)
                        statBox("Treadmill", fmtSpeed(pace), "km/h", phase.text)
                    }
                } else if kind == "rest", let next, next.isEffort {
                    nextCard(next)
                }
                if runner.canGoBack {
                    // The set just done, to fix its numbers (or go back to it).
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Last set, as done").eyebrow(phase.text)
                        SetEditor(runner: runner, index: index - 1, color: phase.text)
                    }
                    .padding(.top, 14)
                }
                Strip(parts: w.parts) { i, _ in Theme.strip(on: kind, done: i < index, current: i == index) }
                    .padding(.top, 22)
                HStack {
                    Text(footer(current, next)).font(.system(size: 17, weight: .bold))
                    Spacer()
                    if runner.canGoBack {
                        Button("Back to set") { runner.backToSet() }
                            .font(.system(size: 15, weight: .bold))
                            .padding(.horizontal, 14)
                            .frame(minHeight: 44)
                            .overlay(Capsule().strokeBorder(phase.text, lineWidth: 2))
                    }
                }
                .padding(.top, 12)
                controls(current, phase)
                    .padding(.top, 26)
            }
            .foregroundStyle(phase.text)
            .padding(.horizontal, 22)
            .padding(.top, 8)
            .padding(.bottom, 16)
            .background(phase.background.ignoresSafeArea())
            .animation(.easeInOut(duration: 0.3), value: kind)
            .preferredColorScheme(kind == "work" || kind == "set" ? .light : .dark)
            .confirmationDialog("End the workout?", isPresented: $confirmStop, titleVisibility: .visible) {
                Button("End workout", role: .destructive) { runner.stop() }
            } message: {
                Text("After 5 minutes the run is kept and sent to your coach.")
            }
        }
    }

    /// A set done by reps: the exercise, its load (changeable), and how long it's been going.
    private func set(_ s: Segment, _ index: Int) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(s.exercise ?? "").font(.display(56)).lineLimit(2).minimumScaleFactor(0.5).direction(of: s.exercise ?? "")
            if let notes = s.notes, !notes.isEmpty {
                Text(notes).font(.system(size: 16, weight: .semibold)).direction(of: notes)
            }
            Text(clock(runner.waited)).font(.display(64, .compressed)).monospacedDigit()
                .accessibilityLabel("\(Int(runner.waited)) seconds in this set")
            SetEditor(runner: runner, index: index, color: Theme.ink)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    /// Before a run that follows strength: what's coming, until the runner taps Ready.
    private func ready(_ w: Workout, _ index: Int) -> some View {
        let run = w.segments[(index + 1)...].prefix { $0.kind != .set && $0.kind != .ready }
        let pace = run.lazy.compactMap(\.pace).first
        return VStack(alignment: .leading, spacing: 12) {
            Text("Run").font(.display(72))
            Text("\(run.filter(\.isWork).count) × \(clock(run.first(where: \.isWork)?.seconds ?? 0)) · \(clock(run.reduce(0) { $0 + $1.seconds })) in all")
                .font(.system(size: 18, weight: .bold))
            if let pace {
                HStack(spacing: 12) {
                    statBox("Target pace", fmtPace(pace), "/km", Theme.paper)
                    statBox("Treadmill", fmtSpeed(pace), "km/h", Theme.paper)
                }
            }
            Text("Tap Ready when you're on it. \(clock(runner.waited)) since the last set.")
                .font(.system(size: 15)).foregroundStyle(Color(hex: 0xD5D7DC))
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func nextCard(_ next: Segment) -> some View {
        HStack(spacing: 14) {
            BrandMark(size: 36)
            VStack(alignment: .leading, spacing: 2) {
                Text("Next").eyebrow()
                Text([next.exercise ?? next.title, next.load ?? clock(next.seconds), next.pace.map { "at \(fmtPace($0)) /km" }].compactMap { $0 }.joined(separator: " · "))
                    .font(.display(22)).lineLimit(1).minimumScaleFactor(0.7)
            }
            Spacer(minLength: 0)
        }
        .foregroundStyle(Theme.ink)
        .padding(.horizontal, 18)
        .padding(.vertical, 16)
        .background(Theme.paper, in: .rect(cornerRadius: 20, style: .continuous))
    }

    /// Stop, and the main button: Done in a set, Ready before a run, pause otherwise (and Skip in a
    /// rest before a set).
    private func controls(_ s: Segment?, _ phase: (background: Color, text: Color)) -> some View {
        HStack(spacing: 28) {
            Button { confirmStop = true } label: {
                Image(systemName: "stop.fill").font(.system(size: 20))
                    .frame(width: 64, height: 64)
                    .overlay(Circle().strokeBorder(phase.text, lineWidth: 2.5))
            }
            .accessibilityLabel("Stop")
            if let s, s.waits {
                Button {
                    if runner.state == .paused { runner.resume() } // a call paused it
                    runner.advance(from: runner.index)
                } label: {
                    Label(s.kind == .set ? "Done" : "Ready", systemImage: s.kind == .set ? "checkmark" : "play.fill")
                        .font(.system(size: 24, weight: .heavy))
                        .foregroundStyle(phase.background)
                        .frame(maxWidth: .infinity, minHeight: 88)
                        .background(phase.text, in: Capsule())
                }
            } else {
                Button { runner.state == .paused ? runner.resume() : runner.pause() } label: {
                    Image(systemName: runner.state == .paused ? "play.fill" : "pause.fill").font(.system(size: 30))
                        .foregroundStyle(phase.background)
                        .frame(width: 88, height: 88)
                        .background(phase.text, in: Circle())
                }
                .accessibilityLabel(runner.state == .paused ? "Resume" : "Pause")
                if runner.canSkip, runner.state == .running {
                    Button { runner.advance(from: runner.index) } label: {
                        Image(systemName: "forward.end.fill").font(.system(size: 20))
                            .frame(width: 64, height: 64)
                            .overlay(Circle().strokeBorder(phase.text, lineWidth: 2.5))
                    }
                    .accessibilityLabel("Skip rest")
                } else {
                    Color.clear.frame(width: 64, height: 64)
                }
            }
        }
    }

    private func subtitle(_ kind: String) -> String {
        switch kind {
        case "work": "left in this rep"
        case "set": "left in this set"
        case "rest": "to walk it off"
        case "warmup": "to warm up"
        default: "to cool down"
        }
    }

    private func footer(_ current: Segment?, _ next: Segment?) -> String {
        guard let next else { return "Last part" }
        if current?.waits == true { return "Next: \(next.next)" }
        if next.isEffort { return "3 beeps, then go" }
        return "Next: \(next.title.lowercased()) \(clock(next.seconds))"
    }

    private func statBox(_ label: String, _ value: String, _ unit: String, _ color: Color) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label).eyebrow(color)
            (Text(value).font(.display(34)) + Text(" \(unit)").font(.system(size: 17, weight: .bold))).monospacedDigit()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).strokeBorder(color, lineWidth: 2))
    }
}

/// A set's reps and weight with − and +: what was planned, until the runner changes it.
private struct SetEditor: View {
    let runner: Runner
    let index: Int
    let color: Color

    var body: some View {
        let log = runner.log(index)
        HStack(spacing: 12) {
            if let reps = log.reps {
                stepper("\(reps)", "reps", "Reps") { runner.change(index, reps: $0 ? 1 : -1) }
            }
            if let weight = log.weight {
                stepper(kg(weight), "kg", "Weight") { runner.change(index, weight: $0 ? 2.5 : -2.5) }
            }
        }
    }

    private func stepper(_ value: String, _ unit: String, _ name: String, _ change: @escaping (Bool) -> Void) -> some View {
        HStack(spacing: 0) {
            Button { change(false) } label: { Image(systemName: "minus").frame(width: 44, height: 44) }
                .accessibilityLabel("Less")
            (Text(value).font(.display(26)) + Text(" \(unit)").font(.system(size: 14, weight: .bold)))
                .monospacedDigit().frame(maxWidth: .infinity)
            Button { change(true) } label: { Image(systemName: "plus").frame(width: 44, height: 44) }
                .accessibilityLabel("More")
        }
        .font(.system(size: 18, weight: .bold))
        .foregroundStyle(color)
        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(color, lineWidth: 2))
        .accessibilityElement(children: .contain)
        .accessibilityLabel("\(name): \(value) \(unit)")
    }
}
