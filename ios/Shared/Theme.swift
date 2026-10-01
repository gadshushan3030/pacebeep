import SwiftUI

/// The design's tokens (design/README.md). Shared by the app and the Live Activity.
enum Theme {
    static let signal = Color(hex: 0xE4572E)
    static let signalOnDark = Color(hex: 0xF07A55)
    static let rest = Color(hex: 0x1D3C8F)
    static let ink = Color(hex: 0x121316)
    static let paper = Color(hex: 0xF5F4F0)
    static let line = Color(hex: 0xE3E1DB)
    static let muted = Color(hex: 0x5C5F66)
    static let sent = Color(hex: 0x1B6E43)

    /// Background and text for a phase of the run: orange to run, blue to rest, ink otherwise.
    static func phase(_ kind: String) -> (background: Color, text: Color) {
        switch kind {
        case "work": (signal, ink)
        case "rest": (rest, paper)
        default: (ink, paper)
        }
    }

    /// One segment of a progress strip on that phase's background.
    static func strip(on kind: String, done: Bool, current: Bool) -> Color {
        switch kind {
        case "work": done ? ink : current ? .white : Color(hex: 0xF2A389)
        case "rest": done ? paper : current ? Color(hex: 0x8FB0FF) : Color(hex: 0x4565C2)
        default: done ? paper : current ? signalOnDark : Color(hex: 0x4A4D55)
        }
    }

    /// A segment's own color in a plan (structure, not progress).
    static func planColor(_ kind: String, onDark: Bool) -> Color {
        switch kind {
        case "work": signal
        case "rest": onDark ? Color(hex: 0x3F63C9) : rest
        default: onDark ? muted : Color(hex: 0x8A8D94)
        }
    }
}

extension Color {
    init(hex: UInt32) {
        self.init(red: Double((hex >> 16) & 0xFF) / 255, green: Double((hex >> 8) & 0xFF) / 255, blue: Double(hex & 0xFF) / 255)
    }
}

extension Font {
    /// Narrow and heavy, for the clock and headings (the web uses Archivo at ~70% width).
    static func display(_ size: CGFloat, _ width: Font.Width = .condensed) -> Font {
        .system(size: size, weight: .heavy).width(width)
    }
}

/// The brand's pulse line (web/app/icon.svg), drawn in a 64-unit box.
struct Pulse: Shape {
    func path(in rect: CGRect) -> Path {
        let s = min(rect.width, rect.height) / 64
        let points: [CGPoint] = [(8, 36), (20, 36), (25, 22), (33, 48), (39, 30), (43, 36), (56, 36)]
            .map { CGPoint(x: rect.minX + $0.0 * s, y: rect.minY + $0.1 * s) }
        var p = Path()
        p.addLines(points)
        return p
    }
}

/// A gentle wave: the rest icon.
struct Wave: Shape {
    func path(in rect: CGRect) -> Path {
        var p = Path()
        let y = rect.midY, w = rect.width / 3, h = rect.height * 0.28
        p.move(to: CGPoint(x: rect.minX, y: y))
        for i in 0..<3 {
            let x = rect.minX + Double(i) * w
            p.addCurve(to: CGPoint(x: x + w, y: y), control1: CGPoint(x: x + w * 0.35, y: y - h), control2: CGPoint(x: x + w * 0.65, y: y + h))
        }
        return p
    }
}

/// The app icon: the pulse on a Signal square.
struct BrandMark: View {
    var size: CGFloat
    var body: some View {
        RoundedRectangle(cornerRadius: size * 0.22, style: .continuous)
            .fill(Theme.signal)
            .overlay(Pulse().stroke(.white, style: StrokeStyle(lineWidth: size * 5 / 64, lineCap: .round, lineJoin: .round)))
            .frame(width: size, height: size)
            .accessibilityHidden(true)
    }
}

/// A phase icon: the pulse for running, the wave for resting.
struct PhaseIcon: View {
    var kind: String
    var color: Color
    var body: some View {
        Group {
            if kind == "rest" {
                Wave().stroke(color, style: StrokeStyle(lineWidth: 2.4, lineCap: .round))
            } else {
                Pulse().stroke(color, style: StrokeStyle(lineWidth: 2.6, lineCap: .round, lineJoin: .round))
            }
        }
        .frame(width: 20, height: 20)
        .accessibilityHidden(true)
    }
}

/// Segments side by side, each as wide as it is long.
struct Strip: View {
    struct Part: Codable, Hashable {
        let kind: String
        let seconds: Int
    }

    let parts: [Part]
    var height: CGFloat = 8
    let color: (Int, Part) -> Color

    var body: some View {
        GeometryReader { geo in
            let gap: CGFloat = height > 6 ? 3 : 2
            let total = Double(parts.reduce(0) { $0 + $1.seconds })
            let room = geo.size.width - gap * Double(max(parts.count - 1, 0))
            HStack(spacing: gap) {
                ForEach(Array(parts.enumerated()), id: \.offset) { i, part in
                    RoundedRectangle(cornerRadius: height > 6 ? 3 : 2)
                        .fill(color(i, part))
                        .frame(width: max(2, room * Double(part.seconds) / max(total, 1)))
                }
            }
        }
        .frame(height: height)
        .accessibilityHidden(true)
    }
}
