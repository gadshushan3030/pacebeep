import SwiftUI

struct ContentView: View {
    @State private var runner = Runner()
    @State private var coach = Coach()
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        Group {
            switch runner.state {
            case .idle:
                if coach.signedIn {
                    HomeView(coach: coach, error: runner.error, start: runner.start)
                } else {
                    SignInView(coach: coach, start: runner.start)
                }
            case .preparing:
                ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity).background(Theme.paper).preferredColorScheme(.light)
            case .running, .paused:
                RunView(runner: runner)
            case .done:
                DoneView(runner: runner, coach: coach)
            }
        }
        .tint(Theme.signal)
        .onAppear { runner.onRun = coach.upload }
        .task(id: scenePhase) { if scenePhase == .active { await coach.sync() } }
    }
}

extension Text {
    /// Small caps-style label above a section or a value.
    func eyebrow(_ color: Color = Theme.muted, size: CGFloat = 13) -> some View {
        font(.system(size: size, weight: .bold)).tracking(1).textCase(.uppercase).foregroundStyle(color)
    }
}

/// Full-width primary button: Ink, or Signal for Start.
struct BigButtonStyle: ButtonStyle {
    var background = Theme.ink
    var foreground = Theme.paper

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 18, weight: .bold))
            .frame(maxWidth: .infinity, minHeight: 56)
            .foregroundStyle(foreground)
            .background(background.opacity(configuration.isPressed ? 0.85 : 1), in: .rect(cornerRadius: 16, style: .continuous))
    }
}

/// "Today · Tue 6 Oct", "Tomorrow · Wed 7 Oct" or "Thu 8 Oct"; short: "THU" and "8".
func dayLabel(_ ymd: String?) -> String? {
    guard let date = parseDay(ymd) else { return nil }
    let day = dayFormat("EEE d MMM").string(from: date)
    if Calendar.current.isDateInToday(date) { return "Today · \(day)" }
    if Calendar.current.isDateInTomorrow(date) { return "Tomorrow · \(day)" }
    return day
}

func parseDay(_ ymd: String?) -> Date? {
    guard let ymd else { return nil }
    return dayFormat("yyyy-MM-dd").date(from: ymd)
}

/// Fixed patterns ("EEE d MMM"); en_US_POSIX because en_GB spells September "Sept".
func dayFormat(_ pattern: String) -> DateFormatter {
    let f = DateFormatter()
    f.locale = Locale(identifier: "en_US_POSIX")
    f.dateFormat = pattern
    return f
}

extension String {
    /// True when the first letter is right-to-left (Hebrew, Arabic): a workout the coach named in Hebrew.
    var isRightToLeft: Bool {
        for scalar in unicodeScalars {
            switch scalar.value {
            case 0x0590...0x08FF, 0xFB1D...0xFDFF, 0xFE70...0xFEFF: return true
            case 0x41...0x5A, 0x61...0x7A, 0xC0...0x24F: return false
            default: continue
            }
        }
        return false
    }
}

extension View {
    /// Coach text in its own direction: Hebrew aligns right even inside the English UI.
    func direction(of text: String) -> some View {
        frame(maxWidth: .infinity, alignment: .leading)
            .environment(\.layoutDirection, text.isRightToLeft ? .rightToLeft : .leftToRight)
    }
}
