import SwiftUI

struct ContentView: View {
    @State private var runner = Runner()

    var body: some View {
        VStack(spacing: 24) {
            switch runner.state {
            case .idle, .done:
                Text("PaceBeep").font(.largeTitle.bold())
                ForEach(Workout.presets) { w in
                    Button { runner.start(w) } label: {
                        VStack {
                            Text(w.name).font(.headline)
                            Text(clock(w.total)).font(.subheadline)
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 8)
                    }
                    .buttonStyle(.borderedProminent)
                }
                Text("Start, lock the screen, put the phone away.")
                    .font(.footnote).foregroundStyle(.secondary)
                if !runner.report.isEmpty {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Last run").font(.headline)
                        ForEach(runner.report, id: \.self) { Text($0).font(.callout) }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding()
                    .background(.quaternary, in: .rect(cornerRadius: 12))
                }
            case .preparing:
                ProgressView("Preparing audio…")
            case .running, .paused:
                if let w = runner.workout {
                    let current = w.segment(at: runner.elapsed)
                    Text(current?.segment.title ?? "Finishing").font(.title.bold())
                    // Rounded up, so the pips before a run land on 3, 2, 1.
                    Text(clock((current?.remaining ?? 0).rounded(.up)))
                        .font(.system(size: 96, weight: .bold, design: .rounded).monospacedDigit())
                    Text("\(clock(runner.elapsed)) / \(clock(w.total))").font(.headline).foregroundStyle(.secondary)
                    HStack(spacing: 16) {
                        if runner.state == .paused {
                            Button("Resume") { runner.resume() }.buttonStyle(.borderedProminent)
                        } else {
                            Button("Pause") { runner.pause() }.buttonStyle(.bordered)
                        }
                        Button("Stop", role: .destructive) { runner.stop() }.buttonStyle(.bordered)
                    }
                    .controlSize(.large)
                }
            }
        }
        .padding()
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(runner.state == .running && runner.workout?.segment(at: runner.elapsed)?.segment.isWork == true ? Color.orange.opacity(0.25) : .clear)
    }
}
