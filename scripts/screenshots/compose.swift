// Composes screenshots into README images (transparent background, 2x GitHub's column width).
// swift compose.swift phones out.png a.png b.png …          → screens side by side, iPhone corner radius
// swift compose.swift cards out.png a.png@x,y,w,h b.png@… → crops (e.g. Live Activities) on a dark panel
// swift compose.swift page out.png a.png                     → one page scaled, rounded with a hairline
import CoreGraphics
import Foundation
import ImageIO
import UniformTypeIdentifiers

let args = CommandLine.arguments
let mode = args[1], out = args[2]
let canvasWidth: CGFloat = 1760

func load(_ path: String) -> CGImage {
    CGImageSourceCreateImageAtIndex(CGImageSourceCreateWithURL(URL(fileURLWithPath: path) as CFURL, nil)!, 0, nil)!
}

func save(_ ctx: CGContext) {
    let dest = CGImageDestinationCreateWithURL(URL(fileURLWithPath: out) as CFURL, UTType.png.identifier as CFString, 1, nil)!
    CGImageDestinationAddImage(dest, ctx.makeImage()!, nil)
    CGImageDestinationFinalize(dest)
}

func canvas(_ w: CGFloat, _ h: CGFloat) -> CGContext {
    let ctx = CGContext(data: nil, width: Int(w), height: Int(h), bitsPerComponent: 8, bytesPerRow: 0,
                        space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
    ctx.interpolationQuality = .high
    return ctx
}

/// Draws an image into a rounded rect (y measured from the top), with a hairline so light screens
/// keep an edge on GitHub's light theme.
func place(_ ctx: CGContext, _ image: CGImage, _ r: CGRect, radius: CGFloat, canvasHeight: CGFloat) {
    let flipped = CGRect(x: r.minX, y: canvasHeight - r.maxY, width: r.width, height: r.height)
    let path = CGPath(roundedRect: flipped, cornerWidth: radius, cornerHeight: radius, transform: nil)
    ctx.saveGState()
    ctx.addPath(path)
    ctx.clip()
    ctx.draw(image, in: flipped)
    ctx.restoreGState()
    ctx.addPath(path)
    ctx.setStrokeColor(CGColor(gray: 0, alpha: 0.12))
    ctx.setLineWidth(2)
    ctx.strokePath()
}

switch mode {
case "phones":
    let images = args[3...].map(load)
    let gap: CGFloat = 32
    let w = (canvasWidth - gap * CGFloat(images.count - 1)) / CGFloat(images.count)
    let h = (w * CGFloat(images[0].height) / CGFloat(images[0].width)).rounded()
    let ctx = canvas(canvasWidth, h)
    for (i, image) in images.enumerated() {
        place(ctx, image, CGRect(x: CGFloat(i) * (w + gap), y: 0, width: w, height: h), radius: w * 0.137, canvasHeight: h)
    }
    save(ctx)

case "cards":
    // Each argument is path@x,y,w,h (pixels from the top left); all crops share one size.
    let images = args[3...].map { arg -> CGImage in
        let parts = arg.split(separator: "@"), c = parts[1].split(separator: ",").map { CGFloat(Double($0)!) }
        return load(String(parts[0])).cropping(to: CGRect(x: c[0], y: c[1], width: c[2], height: c[3]))!
    }
    let crop = [0, 0, CGFloat(images[0].width), CGFloat(images[0].height)]
    let pad: CGFloat = 48, gap: CGFloat = 40
    let w = (canvasWidth - 2 * pad - gap * CGFloat(images.count - 1)) / CGFloat(images.count)
    let h = (w * crop[3] / crop[2]).rounded()
    let H = h + 2 * pad
    let ctx = canvas(canvasWidth, H)
    // A dark panel, like a dimmed lock screen.
    ctx.addPath(CGPath(roundedRect: CGRect(x: 0, y: 0, width: canvasWidth, height: H), cornerWidth: 40, cornerHeight: 40, transform: nil))
    ctx.setFillColor(CGColor(red: 0x1C / 255, green: 0x1D / 255, blue: 0x21 / 255, alpha: 1))
    ctx.fillPath()
    for (i, image) in images.enumerated() {
        place(ctx, image, CGRect(x: pad + CGFloat(i) * (w + gap), y: pad, width: w, height: h), radius: w * 0.064, canvasHeight: H)
    }
    save(ctx)

default: // page
    let image = load(args[3])
    let h = (canvasWidth * CGFloat(image.height) / CGFloat(image.width)).rounded()
    let ctx = canvas(canvasWidth, h)
    place(ctx, image, CGRect(x: 0, y: 0, width: canvasWidth, height: h), radius: 24, canvasHeight: h)
    save(ctx)
}
