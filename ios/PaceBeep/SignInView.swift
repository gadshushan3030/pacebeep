import SwiftUI

/// First launch: what the app is, sign in, or try the beeps first.
struct SignInView: View {
    let coach: Coach
    let start: (Workout) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 28) {
            BrandMark(size: 88)
            Text("Your coach plans the intervals. Your phone counts them.")
                .font(.display(42))
                .fixedSize(horizontal: false, vertical: true)
            Text("Workouts you plan with ChatGPT or Claude show up here. Run with the screen locked: the beeps keep going, and the run goes back to your coach.")
                .font(.system(size: 17))
                .foregroundStyle(Color(hex: 0x4A4D55))
            Spacer(minLength: 0)
            VStack(spacing: 14) {
                if let message = coach.message {
                    Text(message).font(.footnote).foregroundStyle(Theme.muted)
                }
                Button("Sign in to PaceBeep") { Task { await coach.signIn() } }
                    .buttonStyle(BigButtonStyle())
                Text("Opens \(Auth.server.host() ?? "the PaceBeep site") · Apple, Google or email")
                    .font(.footnote).foregroundStyle(Theme.muted)
                Button("Try a 2-minute test first") { start(.quickTest) }
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(Theme.ink)
                    .frame(minHeight: 44)
            }
            .frame(maxWidth: .infinity)
        }
        .foregroundStyle(Theme.ink)
        .padding(.horizontal, 24)
        .padding(.top, 40)
        .padding(.bottom, 24)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(Theme.paper)
        .preferredColorScheme(.light)
    }
}
