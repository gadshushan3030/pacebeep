import SwiftUI

/// The next workout from the coach up top, the rest of the plan below, the quick test last.
/// A workout the coach planned waits for approval: Approve (the time can move) or Start, which approves too.
struct HomeView: View {
    @Bindable var coach: Coach
    let error: String?
    /// A reminder was tapped: that workout goes up top.
    var opened: String?
    let start: (Workout) -> Void
    @State private var approving: Workout?

    var body: some View {
        let next = coach.workouts.first { $0.id == opened } ?? coach.workouts.first { !$0.done }
        let others = coach.workouts.filter { $0.id != next?.id }
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                header
                if let next {
                    NextCard(workout: next, approve: { approving = next }) { go(next) }
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
                        ForEach(others) { w in WorkoutRow(workout: w, approve: { approving = w }) { go(w) } }
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
                HStack(spacing: 20) {
                    // Explicit red: the VStack's ink foreground would override the destructive role's.
                    Button("Sign out", role: .destructive) { coach.signOut() }.foregroundStyle(Theme.bad)
                    // App Store rule 5.1.1(v): account deletion reachable from the app. The web page does it.
                    Link("Delete account", destination: Auth.server.appending(path: "account")).foregroundStyle(Theme.muted)
                }
                .font(.footnote)
            }
            .foregroundStyle(Theme.ink)
            .padding(.horizontal, 20)
            .padding(.top, 8)
            .padding(.bottom, 28)
        }
        .background(Theme.paper)
        .refreshable { await coach.sync() }
        .sheet(item: $approving) { w in ApproveSheet(workout: w) { coach.approve(w, at: $0) } }
        .alert("Remind you when it's time?", isPresented: $coach.remindersOffer) {
            Button("Remind me") { Task { await coach.enableReminders() } }
            Button("Not now", role: .cancel) {}
        } message: {
            Text("A reminder at the time of each workout you approve. Nothing else.")
        }
        .preferredColorScheme(.light)
    }

    /// Start on a workout still waiting for approval approves it as it is.
    private func go(_ w: Workout) {
        if w.pending { coach.approve(w) }
        start(w)
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

/// The next workout: big, dark, one Start button (and Approve while it waits for one).
private struct NextCard: View {
    let workout: Workout
    let approve: () -> Void
    let start: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(alignment: .firstTextBaseline) {
                Text(whenLabel(workout) ?? "Anytime").eyebrow(Theme.signalOnDark).lineLimit(1).minimumScaleFactor(0.8).layoutPriority(1)
                Spacer()
                Text(workout.pending ? "New from your coach" : "From your coach").font(.footnote).foregroundStyle(Color(hex: 0xB9BCC3)).lineLimit(1)
            }
            // Long names (a coach writing a whole title) get a smaller size instead of a third line.
            Text(workout.name).font(.display(workout.name.count > 18 ? 34 : 46)).lineLimit(3).minimumScaleFactor(0.6).direction(of: workout.name)
            HStack(spacing: 20) {
                stat("\(workout.hasWaits ? "~" : "")\(Int((workout.total / 60).rounded()))", "min")
                if let pace = workout.pace { stat(pace, "/km") }
                if let speed = workout.speed { stat(speed, "km/h") }
            }
            Strip(parts: workout.parts, height: 10) { _, part in Theme.planColor(part.kind, onDark: true) }
            if let notes = workout.notes, !notes.isEmpty {
                Text(notes).font(.system(size: 15)).foregroundStyle(Color(hex: 0xD5D7DC)).direction(of: notes)
            }
            if workout.pending {
                Text("Waiting for your OK. Approve it to be reminded at its time; Start approves it too.")
                    .font(.system(size: 15)).foregroundStyle(Color(hex: 0xD5D7DC))
            }
            HStack(spacing: 10) {
                if workout.pending {
                    Button(action: approve) { Label("Approve", systemImage: "bell") }
                        .buttonStyle(BigButtonStyle(background: Theme.paper, foreground: Theme.ink))
                }
                Button(action: start) {
                    Label("Start", systemImage: "play.fill").font(.system(size: 19, weight: .heavy))
                }
                .buttonStyle(BigButtonStyle(background: Theme.signal, foreground: Theme.ink))
            }
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

/// A later workout: day, name, time, length and target. Tap to start it; one still waiting for
/// approval has its Approve on the right.
private struct WorkoutRow: View {
    let workout: Workout
    let approve: () -> Void
    let start: () -> Void

    var body: some View {
        HStack(spacing: 0) {
            Button(action: start) {
                content
            }
            .buttonStyle(.plain)
            if workout.pending {
                Button("Approve", action: approve)
                    .font(.system(size: 13, weight: .bold))
                    .foregroundStyle(Theme.paper)
                    .padding(.horizontal, 12).padding(.vertical, 7)
                    .background(Theme.ink, in: .capsule)
                    .padding(.trailing, 12)
            }
        }
        .frame(minHeight: 68)
        .background(.white, in: .rect(cornerRadius: 18, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).strokeBorder(Theme.line))
    }

    private var content: some View {
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
                Text([ workout.scheduledTime, "\(workout.hasWaits ? "~" : "")\(Int((workout.total / 60).rounded())) min", workout.paceText ].compactMap { $0 }.joined(separator: " · "))
                    .font(.footnote).foregroundStyle(Theme.muted)
            }
            Spacer(minLength: 0)
            if workout.pending {
                Text("Pending").font(.system(size: 11, weight: .bold)).foregroundStyle(Theme.signal)
            } else {
                Image(systemName: workout.done ? "checkmark.circle.fill" : "chevron.right")
                    .font(.system(size: workout.done ? 22 : 15, weight: .semibold))
                    .foregroundStyle(workout.done ? Theme.sent : Theme.muted)
                    .accessibilityLabel(workout.done ? "Done" : "")
            }
        }
        .padding(.leading, 12)
        .padding(.trailing, 16)
        .frame(minHeight: 68)
    }
}

/// Approving a workout the coach planned: the time of day (the coach's, movable) and one button.
private struct ApproveSheet: View {
    let workout: Workout
    /// Called with the time (HH:MM) when the workout has a day, nil otherwise.
    let approve: (String?) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var time: Date

    init(workout: Workout, approve: @escaping (String?) -> Void) {
        self.workout = workout
        self.approve = approve
        let day = parseDay(workout.scheduledFor) ?? Date()
        _time = State(initialValue: workout.scheduledDate ?? Calendar.current.date(bySettingHour: 8, minute: 0, second: 0, of: day)!)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text(dayLabel(workout.scheduledFor) ?? "Anytime").eyebrow()
            Text(workout.name).font(.display(30)).lineLimit(2).minimumScaleFactor(0.7).direction(of: workout.name)
            if workout.scheduledFor != nil {
                DatePicker("Remind me at", selection: $time, displayedComponents: .hourAndMinute)
                    .datePickerStyle(.wheel).labelsHidden().frame(maxWidth: .infinity)
                Text("You'll get one reminder, at this time.").font(.footnote).foregroundStyle(Theme.muted)
            } else {
                Text("No day set, so no reminder; approving tells your coach you're in.").font(.footnote).foregroundStyle(Theme.muted)
            }
            Button("Approve") {
                let hm = Calendar.current.dateComponents([.hour, .minute], from: time)
                approve(workout.scheduledFor == nil ? nil : String(format: "%02d:%02d", hm.hour!, hm.minute!))
                dismiss()
            }
            .buttonStyle(BigButtonStyle())
        }
        .padding(20)
        .foregroundStyle(Theme.ink)
        .presentationDetents([.medium])
        .presentationBackground(Theme.paper)
    }
}

/// "Today · Tue 6 Oct · 08:00": the day label with the time when there is one.
func whenLabel(_ w: Workout) -> String? {
    dayLabel(w.scheduledFor).map { [$0, w.scheduledTime].compactMap { $0 }.joined(separator: " · ") }
}
