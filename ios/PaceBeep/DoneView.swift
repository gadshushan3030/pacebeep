import SwiftUI

/// After the run: what happened, how hard it felt (RPE), and whether the coach has it.
struct DoneView: View {
    let runner: Runner
    let coach: Coach

    var body: some View {
        if let s = runner.summary {
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    VStack(alignment: .leading, spacing: 6) {
                        Text(dayFormat("EEE d MMM · HH:mm").string(from: s.startedAt)).eyebrow()
                        Text(s.finished ? "Workout complete" : "Workout stopped").font(.display(46))
                    }
                    summaryCard(s)
                    if s.audioGap > 1 {
                        Label("The audio stopped for \(s.audioGap) s, so some beeps came late.", systemImage: "exclamationmark.triangle")
                            .font(.system(size: 15)).foregroundStyle(Color(hex: 0x9A3412))
                    }
                    if s.recorded { rpe }
                    status(s)
                }
                .foregroundStyle(Theme.ink)
                .padding(.horizontal, 20)
                .padding(.top, 8)
                .padding(.bottom, 20)
            }
            .safeAreaInset(edge: .bottom) {
                Button("Done") { runner.dismiss() }
                    .buttonStyle(BigButtonStyle())
                    .padding(.horizontal, 20)
                    .padding(.bottom, 8)
                    .background(Theme.paper)
            }
            .background(Theme.paper)
            .preferredColorScheme(.light)
        }
    }

    private func summaryCard(_ s: Runner.Summary) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            Text(s.workout.name).font(.display(20)).direction(of: s.workout.name)
            HStack(alignment: .top) {
                value(clock(s.seconds), "time")
                value("\(s.repsDone) / \(s.reps)", "reps")
                value("\(s.pauses)", s.pauses == 1 ? "pause" : "pauses")
            }
            // Done parts in their own colors; the ones a stop skipped stay grey.
            let reached = s.workout.segments.reduce(into: (count: 0, start: 0.0)) { acc, seg in
                if acc.start < runner.elapsed || s.finished { acc.count += 1 }
                acc.start += seg.seconds
            }.count
            Strip(parts: s.workout.parts) { i, part in i < reached ? Theme.planColor(part.kind, onDark: false) : Theme.line }
        }
        .padding(18)
        .background(.white, in: .rect(cornerRadius: 22, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).strokeBorder(Theme.line))
    }

    private func value(_ number: String, _ label: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(number).font(.display(30)).monospacedDigit()
            Text(label).font(.footnote).foregroundStyle(Theme.muted)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var rpe: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .firstTextBaseline) {
                Text("How hard was it?").font(.display(24))
                Spacer()
                Text("1 easy · 10 all out").font(.footnote).foregroundStyle(Theme.muted)
            }
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: 5), spacing: 8) {
                ForEach(1...10, id: \.self) { n in
                    let picked = runner.rating == n
                    Button { runner.rate(n) } label: {
                        Text("\(n)").font(.display(22))
                            .frame(maxWidth: .infinity, minHeight: 56)
                            .foregroundStyle(picked ? Theme.paper : Theme.ink)
                            .background(picked ? Theme.ink : .white, in: .rect(cornerRadius: 16, style: .continuous))
                            .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).strokeBorder(picked ? Theme.ink : Color(hex: 0xD6D3CB)))
                    }
                    .buttonStyle(.plain)
                    .disabled(runner.rating != nil && !picked)
                    .accessibilityAddTraits(picked ? .isSelected : [])
                }
            }
        }
    }

    private func status(_ s: Runner.Summary) -> some View {
        let (text, icon, color): (String, String, Color) =
            if !s.recorded { ("Test runs aren't sent to your coach.", "info.circle", Theme.muted) }
            else if !coach.signedIn { ("Saved on this phone. Sign in to send it to your coach.", "tray", Theme.muted) }
            else if coach.pendingRuns > 0 { ("Waiting for a connection to send it to your coach.", "icloud.and.arrow.up", Theme.muted) }
            else { ("Sent to your coach" + (runner.rating.map { ", with RPE \($0)" } ?? ""), "checkmark", Theme.sent) }
        return Label(text, systemImage: icon).font(.system(size: 15, weight: .semibold)).foregroundStyle(color)
    }
}
