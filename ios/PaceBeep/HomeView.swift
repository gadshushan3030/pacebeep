import SwiftUI

/// The next workout from the coach up top, the rest of the plan below, the quick test last.
struct HomeView: View {
    let coach: Coach
    let error: String?
    let start: (Workout) -> Void

    var body: some View {
        let next = coach.workouts.first { !$0.done }
        let others = coach.workouts.filter { $0.id != next?.id }
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                header
                if let next {
                    NextCard(workout: next) { start(next) }
                } else {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Nothing planned").font(.display(30))
                        Text("Ask your assistant to plan your week in PaceBeep, then pull down to refresh.")
                            .font(.system(size: 15)).foregroundStyle(Color(hex: 0xD5D7DC))
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(20)
                    .foregroundStyle(Theme.paper)
                    .background(Theme.ink, in: .rect(cornerRadius: 26, style: .continuous))
                }
                if !others.isEmpty {
                    VStack(alignment: .leading, spacing: 10) {
                        Text("Coming up").eyebrow()
                        ForEach(others) { w in WorkoutRow(workout: w) { start(w) } }
                    }
                }
                VStack(alignment: .leading, spacing: 10) {
                    Text("Built in").eyebrow()
                    Button { start(.quickTest) } label: {
                        HStack(spacing: 12) {
                            Image(systemName: "speaker.wave.2").font(.system(size: 18, weight: .semibold))
                            VStack(alignment: .leading, spacing: 2) {
                                Text("Quick test").font(.system(size: 16, weight: .bold))
                                Text("2 min · check the beeps with the screen locked").font(.footnote).foregroundStyle(Theme.muted)
                            }
                            Spacer(minLength: 0)
                        }
                        .padding(.horizontal, 16)
                        .padding(.vertical, 10)
                        .frame(minHeight: 56)
                        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).strokeBorder(Color(hex: 0xB9B6AD), style: StrokeStyle(lineWidth: 1.5, dash: [5, 4])))
                    }
                    .buttonStyle(.plain)
                }
                ForEach([error, coach.message].compactMap { $0 }, id: \.self) {
                    Text($0).font(.footnote).foregroundStyle(Theme.muted)
                }
                // Explicit red: the VStack's ink foreground would override the destructive role's.
                Button("Sign out", role: .destructive) { coach.signOut() }.font(.footnote).foregroundStyle(Theme.bad)
            }
            .foregroundStyle(Theme.ink)
            .padding(.horizontal, 20)
            .padding(.top, 8)
            .padding(.bottom, 28)
        }
        .background(Theme.paper)
        .refreshable { await coach.sync() }
        .preferredColorScheme(.light)
    }

    private var header: some View {
        HStack(spacing: 8) {
            BrandMark(size: 28)
            Text("PaceBeep").font(.display(21))
            Spacer()
            Text(status).font(.footnote).foregroundStyle(Theme.muted)
        }
    }

    private var status: String {
        if coach.pendingRuns > 0 { return "\(coach.pendingRuns) run\(coach.pendingRuns == 1 ? "" : "s") waiting to upload" }
        guard let lastSync = coach.lastSync else { return "Saved on this phone" }
        let minutes = Int(Date().timeIntervalSince(lastSync) / 60)
        return minutes < 1 ? "Synced just now" : "Synced \(minutes) min ago"
    }
}

/// The next workout: big, dark, one Start button.
private struct NextCard: View {
    let workout: Workout
    let start: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(alignment: .firstTextBaseline) {
                Text(dayLabel(workout.scheduledFor) ?? "Anytime").eyebrow(Theme.signalOnDark)
                Spacer()
                Text("From your coach").font(.footnote).foregroundStyle(Color(hex: 0xB9BCC3))
            }
            // Long names (a coach writing a whole title) get a smaller size instead of a third line.
            Text(workout.name).font(.display(workout.name.count > 18 ? 34 : 46)).lineLimit(3).minimumScaleFactor(0.6).direction(of: workout.name)
            HStack(spacing: 20) {
                stat("\(Int((workout.total / 60).rounded()))", "min")
                if let pace = workout.pace { stat(pace, "/km") }
                if let speed = workout.speed { stat(speed, "km/h") }
            }
            Strip(parts: workout.parts, height: 10) { _, part in Theme.planColor(part.kind, onDark: true) }
            if let notes = workout.notes, !notes.isEmpty {
                Text(notes).font(.system(size: 15)).foregroundStyle(Color(hex: 0xD5D7DC)).direction(of: notes)
            }
            Button(action: start) {
                Label("Start", systemImage: "play.fill").font(.system(size: 19, weight: .heavy))
            }
            .buttonStyle(BigButtonStyle(background: Theme.signal, foreground: Theme.ink))
        }
        .padding(20)
        .foregroundStyle(Theme.paper)
        .background(Theme.ink, in: .rect(cornerRadius: 26, style: .continuous))
    }

    private func stat(_ value: String, _ unit: String) -> some View {
        (Text(value).fontWeight(.bold).foregroundColor(Theme.paper) + Text(" \(unit)").foregroundColor(Color(hex: 0xD5D7DC)))
            .font(.system(size: 15))
    }
}

/// A later workout: day, name, length and target. Tap to start it.
private struct WorkoutRow: View {
    let workout: Workout
    let start: () -> Void

    var body: some View {
        Button(action: start) {
            HStack(spacing: 14) {
                VStack(spacing: 1) {
                    if let date = parseDay(workout.scheduledFor) {
                        Text(dayFormat("EEE").string(from: date)).eyebrow(size: 11)
                        Text(dayFormat("d").string(from: date)).font(.display(24))
                    } else {
                        Image(systemName: "calendar").font(.system(size: 18)).foregroundStyle(Theme.muted)
                    }
                }
                .frame(width: 44)
                VStack(alignment: .leading, spacing: 3) {
                    Text(workout.name).font(.display(18)).direction(of: workout.name)
                    Text([ "\(Int((workout.total / 60).rounded())) min", workout.paceText ].compactMap { $0 }.joined(separator: " · "))
                        .font(.footnote).foregroundStyle(Theme.muted)
                }
                Spacer(minLength: 0)
                Image(systemName: workout.done ? "checkmark.circle.fill" : "chevron.right")
                    .font(.system(size: workout.done ? 22 : 15, weight: .semibold))
                    .foregroundStyle(workout.done ? Theme.sent : Theme.muted)
                    .accessibilityLabel(workout.done ? "Done" : "")
            }
            .padding(.leading, 12)
            .padding(.trailing, 16)
            .frame(minHeight: 68)
            .background(.white, in: .rect(cornerRadius: 18, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).strokeBorder(Theme.line))
        }
        .buttonStyle(.plain)
    }
}
