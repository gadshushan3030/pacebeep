# PaceBeep design

The design lives on a canvas: **[PaceBeep design](https://claude.ai/artifact/CU2HG3GFfo8SK3Vh7aBeao)** (private; share it from the canvas's Share menu). `canvas/` is its source: one `.dc.html` per artboard and `canvas.json` for the layout. The files need the canvas runtime to render, so open them on the canvas; here they are versioned with the code they describe.

| Artboard | What it is | Where it lives in code |
|---|---|---|
| `SignIn`, `Main`, `RunWork`, `RunRest`, `Done` | iPhone app: sign in, home, run (work / rest), after the run | `ios/PaceBeep/*View.swift` |
| `LiveWork`, `LiveRest`, `Island` | Live Activity on the lock screen and in the Dynamic Island | `ios/PaceBeepWidget/PaceBeepWidget.swift` |
| `Dashboard`, `RunDetail` | Web: dashboard and one run | `web/app/(main)/page.tsx`, `web/app/(main)/runs/[id]/page.tsx` |
| `Brand` | Icon, colors, type | `web/app/icon.svg`, `ios/PaceBeep/Assets.xcassets` |

## Tokens

| Name | Hex | Use | Web | iOS |
|---|---|---|---|---|
| Signal | `#E4572E` | Work intervals, the brand mark, Start | `--signal` | `Theme.signal` |
| Signal on dark | `#F07A55` | Orange text on Ink | `--signal` (dark) | `Theme.signalOnDark` |
| Rest | `#1D3C8F` | Rest intervals | `--rest` | `Theme.rest` |
| Ink | `#121316` | Text, primary buttons, warm-up and cool-down | `--text`, `--primary` | `Theme.ink` |
| Paper | `#F5F4F0` | Ground | `--bg` | `Theme.paper` |
| Line | `#E3E1DB` | Card borders | `--border` | `Theme.line` |
| Muted | `#5C5F66` | Secondary text (6:1 on Paper) | `--muted` | `Theme.muted` |
| Sent | `#1B6E43` | Done, synced | `--good` | `Theme.sent` |

Work and rest differ in lightness, not only hue, so they read at a glance in sunlight and with red-green color blindness. White text never sits on Signal: Ink does (5:1).

## Type

Narrow and heavy for the clock and headings, so big numbers fit a phone; normal width for everything you read.

- Web: [Archivo](https://fonts.google.com/specimen/Archivo) through `next/font` (width axis on), `.display` = weight 800 at 70–78% width.
- iOS: SF in its condensed and compressed widths (`Font.display`), so the app and the Live Activity need no bundled font.
