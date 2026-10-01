import SwiftUI

/// The run: the whole screen takes the phase's color (orange to run, blue to rest, ink to warm up
/// and cool down), with the clock as big as it fits.
struct RunView: View {
    let runner: Runner
    @State private var confirmStop = false

    var body: some View {
        if let w = runner.workout {
            let current = w.segment(at: runner.elapsed)
            let index = current?.index ?? w.segments.count
            let kind = current?.segment.kind.rawValue ?? "cooldown"
            let phase = Theme.phase(kind)
            let next = w.next(after: index)
            VStack(spacing: 0) {
                HStack {
                    Text(runner.state == .paused ? "Paused" : current?.segment.title ?? "Finishing").eyebrow(phase.text, size: 15)
                    Spacer()
                    Text("\(clock(runner.elapsed)) / \(clock(w.total))").font(.system(size: 15, weight: .bold)).monospacedDigit()
                }
                Spacer(minLength: 12)
                // Rounded up, so the pips before a run land on 3, 2, 1.
                Text(clock((current?.remaining ?? 0).rounded(.up)))
                    .font(.display(210, .compressed)).monospacedDigit()
                    .lineLimit(1).minimumScaleFactor(0.4)
                    .accessibilityLabel("\(Int((current?.remaining ?? 0).rounded(.up))) seconds left")
                Text(subtitle(kind)).font(.system(size: 16, weight: .semibold))
                Spacer(minLength: 12)
                if kind == "work", let pace = w.pace, let speed = w.speed {
                    HStack(spacing: 12) {
                        statBox("Target pace", pace, "/km", phase.text)
                        statBox("Treadmill", speed, "km/h", phase.text)
                    }
                } else if kind != "work", let next, next.isWork {
                    HStack(spacing: 14) {
                        BrandMark(size: 36)
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Next").eyebrow()
                            Text([next.title, clock(next.seconds), w.pace.map { "at \($0) /km" }].compactMap { $0 }.joined(separator: " · "))
                                .font(.display(22)).lineLimit(1).minimumScaleFactor(0.7)
                        }
                        Spacer(minLength: 0)
                    }
                    .foregroundStyle(Theme.ink)
                    .padding(.horizontal, 18)
                    .padding(.vertical, 16)
                    .background(Theme.paper, in: .rect(cornerRadius: 20, style: .continuous))
                }
                Strip(parts: w.parts) { i, _ in Theme.strip(on: kind, done: i < index, current: i == index) }
                    .padding(.top, 22)
                Text(footer(kind, next)).font(.system(size: 17, weight: .bold))
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.top, 12)
                HStack(spacing: 28) {
                    Button { confirmStop = true } label: {
                        Image(systemName: "stop.fill").font(.system(size: 20))
                            .frame(width: 64, height: 64)
                            .overlay(Circle().strokeBorder(phase.text, lineWidth: 2.5))
                    }
                    .accessibilityLabel("Stop")
                    Button { runner.state == .paused ? runner.resume() : runner.pause() } label: {
                        Image(systemName: runner.state == .paused ? "play.fill" : "pause.fill").font(.system(size: 30))
                            .foregroundStyle(phase.background)
                            .frame(width: 88, height: 88)
                            .background(phase.text, in: Circle())
                    }
                    .accessibilityLabel(runner.state == .paused ? "Resume" : "Pause")
                    Color.clear.frame(width: 64, height: 64)
                }
                .padding(.top, 26)
            }
            .foregroundStyle(phase.text)
            .padding(.horizontal, 22)
            .padding(.top, 8)
            .padding(.bottom, 16)
            .background(phase.background.ignoresSafeArea())
            .animation(.easeInOut(duration: 0.3), value: kind)
            .preferredColorScheme(kind == "work" ? .light : .dark)
            .confirmationDialog("End the workout?", isPresented: $confirmStop, titleVisibility: .visible) {
                Button("End workout", role: .destructive) { runner.stop() }
            } message: {
                Text("After 5 minutes the run is kept and sent to your coach.")
            }
        }
    }

    private func subtitle(_ kind: String) -> String {
        switch kind {
        case "work": "left in this rep"
        case "rest": "to walk it off"
        case "warmup": "to warm up"
        default: "to cool down"
        }
    }

    private func footer(_ kind: String, _ next: Segment?) -> String {
        guard let next else { return "Last part" }
        if next.isWork { return "3 beeps, then go" }
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
