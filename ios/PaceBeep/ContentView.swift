import SwiftUI

struct ContentView: View {
    @State private var runner = Runner()
    @State private var coach = Coach()
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        Group {
            switch runner.state {
            case .idle, .done: home
            case .preparing: ProgressView("Preparing audio…")
            case .running, .paused: running
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(runner.state == .running && runner.workout?.segment(at: runner.elapsed)?.segment.isWork == true ? Color.orange.opacity(0.25) : .clear)
        .onAppear { runner.onRun = coach.upload }
        .task(id: scenePhase) { if scenePhase == .active { await coach.sync() } }
    }

    private var home: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text("PaceBeep").font(.largeTitle.bold())
                if runner.unrated != nil { rpe }
                if !runner.report.isEmpty { lastRun }

                if coach.signedIn {
                    Text("From your coach").font(.title3.bold())
                    if coach.workouts.isEmpty {
                        Text("Nothing planned yet. Ask your assistant to plan your week in PaceBeep.")
                            .foregroundStyle(.secondary)
                    }
                    ForEach(coach.workouts) { w in workoutButton(w) }
                } else {
                    Button { Task { await coach.signIn() } } label: {
                        Text("Sign in to get workouts from your coach").frame(maxWidth: .infinity).padding(.vertical, 8)
                    }
                    .buttonStyle(.borderedProminent)
                }
                if coach.pendingRuns > 0 {
                    Label("\(coach.pendingRuns) run\(coach.pendingRuns == 1 ? "" : "s") waiting to upload", systemImage: "icloud.and.arrow.up")
                        .font(.footnote).foregroundStyle(.secondary)
                }
                if let message = coach.message { Text(message).font(.footnote).foregroundStyle(.secondary) }

                Text("Built in").font(.title3.bold()).padding(.top, 8)
                ForEach(Workout.presets) { w in workoutButton(w) }
                Text("Start, lock the screen, put the phone away.").font(.footnote).foregroundStyle(.secondary)
                if coach.signedIn {
                    Button("Sign out", role: .destructive) { coach.signOut() }.font(.footnote)
                }
            }
            .padding()
        }
        .refreshable { await coach.sync() }
    }

    private func workoutButton(_ w: Workout) -> some View {
        Button { runner.start(w) } label: {
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    if let day = dayLabel(w.scheduledFor) { Text(day).font(.caption.bold()).textCase(.uppercase).opacity(0.8) }
                    Text(w.name).font(.headline)
                    Text([clock(w.total), w.paceText].compactMap { $0 }.joined(separator: " · ")).font(.subheadline)
                }
                Spacer()
                if w.done { Image(systemName: "checkmark.circle.fill").font(.title2) }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.vertical, 6)
        }
        .buttonStyle(.borderedProminent)
        .tint(w.done ? .gray : .accentColor)
    }

    private var rpe: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("How hard was it?").font(.headline)
            Text("1 = very easy, 10 = all out. Your coach sees this.").font(.footnote).foregroundStyle(.secondary)
            LazyVGrid(columns: Array(repeating: GridItem(.flexible()), count: 5)) {
                ForEach(1...10, id: \.self) { n in
                    Button { runner.rate(n) } label: { Text("\(n)").frame(maxWidth: .infinity) }
                        .buttonStyle(.bordered)
                        .controlSize(.large)
                }
            }
        }
        .padding()
        .background(.quaternary, in: .rect(cornerRadius: 12))
    }

    private var lastRun: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Last run").font(.headline)
            ForEach(runner.report, id: \.self) { Text($0).font(.callout) }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding()
        .background(.quaternary, in: .rect(cornerRadius: 12))
    }

    @ViewBuilder private var running: some View {
        if let w = runner.workout {
            let current = w.segment(at: runner.elapsed)
            VStack(spacing: 24) {
                Text(current?.segment.title ?? "Finishing").font(.title.bold())
                if current?.segment.isWork == true, let pace = w.paceText { Text(pace).font(.title3).foregroundStyle(.secondary) }
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
            .padding()
        }
    }

    /// "Today", "Tomorrow" or "Tue 6 Oct".
    private func dayLabel(_ ymd: String?) -> String? {
        guard let ymd else { return nil }
        let parse = DateFormatter()
        parse.locale = Locale(identifier: "en_US_POSIX")
        parse.dateFormat = "yyyy-MM-dd"
        guard let date = parse.date(from: ymd) else { return nil }
        if Calendar.current.isDateInToday(date) { return "Today" }
        if Calendar.current.isDateInTomorrow(date) { return "Tomorrow" }
        return date.formatted(.dateTime.locale(Locale(identifier: "en_GB")).weekday(.abbreviated).day().month(.abbreviated))
    }
}
