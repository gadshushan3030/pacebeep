import SwiftUI
import UIKit

/// A plan from a personal assistant, with nothing connected: copy a prompt, give it to the assistant, paste its answer.
struct PlanSheet: View {
    let coach: Coach
    @Environment(\.dismiss) private var dismiss
    @State private var copied = false
    @State private var busy = false
    @State private var result: (ok: Bool, message: String)?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text("From your assistant").eyebrow()
                Text("Paste a plan").font(.display(30))
                Text("1. Copy the prompt and send it to your personal assistant, with what you want: “a 9-week run-walk plan to my first 5K, 3 days a week”.")
                Button {
                    Task {
                        guard let prompt = await coach.planPrompt() else { return result = (false, "No connection. Try again.") }
                        UIPasteboard.general.string = prompt
                        copied = true
                    }
                } label: {
                    Label(copied ? "Prompt copied" : "Copy the prompt", systemImage: copied ? "checkmark" : "doc.on.doc")
                }
                .buttonStyle(BigButtonStyle())
                Text("2. Copy its answer, come back here and paste it.")
                // The system's paste button: no "allow paste" question, unlike reading the clipboard directly.
                PasteButton(payloadType: String.self) { strings in
                    guard let text = strings.first else { return }
                    Task { @MainActor in
                        busy = true
                        result = await coach.importPlan(text)
                        busy = false
                    }
                }
                .labelStyle(.titleAndIcon)
                .buttonBorderShape(.capsule)
                .tint(Theme.ink)
                .controlSize(.large)
                .disabled(busy)
                if busy { ProgressView() }
                if let result {
                    // Selectable: an error names the workout and the field, to paste back to the assistant.
                    Text(result.message).font(.footnote).foregroundStyle(result.ok ? Theme.sent : Theme.bad).textSelection(.enabled)
                    if result.ok { Button("Done") { dismiss() }.buttonStyle(BigButtonStyle(background: Theme.signal, foreground: Theme.ink)) }
                }
            }
            .font(.system(size: 15))
            .foregroundStyle(Theme.ink)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(20)
        }
        .presentationBackground(Theme.paper)
    }
}
