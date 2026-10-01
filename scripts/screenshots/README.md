# README screenshots

How `docs/screenshots/*.png` are made: real screens of the app and the site (not mockups) against a local server with sample data, composed at 1760 px wide (2x GitHub's README column) on transparent backgrounds.

## 1. Local server and sample data

```bash
cd web && npm run db:up
docker exec pacebeep-db createdb -U postgres pacebeep_shots
# web/.env.local: DATABASE_URL=…/pacebeep_shots, BETTER_AUTH_URL=http://localhost:3201, a BETTER_AUTH_SECRET
npm run db:migrate && npm run dev -- -p 3201
```

Create the demo account (a throwaway password; keep it out of the repo), seed it, and connect a "ChatGPT" client through the real OAuth flow so the dashboard lists it:

```bash
export PB_EMAIL=runner@example.test PB_PASSWORD=$(openssl rand -hex 8)
curl -s -X POST http://localhost:3201/api/auth/sign-up/email -H 'content-type: application/json' -H 'origin: http://localhost:3201' \
  -d "{\"email\":\"$PB_EMAIL\",\"password\":\"$PB_PASSWORD\",\"name\":\"Alex\"}"
docker exec -i pacebeep-db psql -U postgres -d pacebeep_shots < scripts/screenshots/seed.sql
node scripts/screenshots/connect-chatgpt.mjs
```

## 2. iPhone (simulator, iPhone 17 Pro)

```bash
xcrun simctl status_bar booted override --dataNetwork wifi --wifiBars 3 --cellularBars 4 --batteryState discharging --batteryLevel 100
xcodebuild -project ios/PaceBeep.xcodeproj -scheme PaceBeep -destination 'platform=iOS Simulator,name=iPhone 17 Pro' \
  -derivedDataPath ios/build SERVER_URL=http://localhost:3201 build
```

The status bar keeps the real time, so it agrees with the start time on the after-the-run screen. Install, sign in with the demo account, then `xcrun simctl io booted screenshot <file>.png`:

| File | When |
|---|---|
| `home.png` | Home, synced |
| `run-work.png` | Start today's workout; 6:15 in (run 3, 0:45 left) |
| `run-rest.png` | 7:22 in (the rest after run 3) |
| `lock-work.png` | Lock the screen; 8:26 in (run 4) |
| `lock-rest.png` | 9:28 in (the rest after run 4) |
| `done.png` | After 13:03, unlock, pick an RPE |

On a fresh install iOS asks once, under the Live Activity, whether to allow it. While that prompt shows, the card sits higher on the lock screen (y = 1573 on iPhone 17 Pro); once it's answered, the card sits at the bottom (y = 1890). Either way the crop below takes the card alone.

## 3. Web

```bash
node scripts/screenshots/capture-web.mjs / dashboard.png 1280 light
```

Headless Chrome with a throwaway profile, signed in as the demo account, at 2x; it removes the dev-server badge and crops below the content.

## 4. Compose

```bash
swift scripts/screenshots/compose.swift phones docs/screenshots/app.png home.png run-work.png run-rest.png done.png
# Live Activity crops in pixels (iPhone 17 Pro, prompt showing; use y = 1890 once it's answered).
swift scripts/screenshots/compose.swift cards docs/screenshots/live-activity.png lock-work.png@42,1573,1122,346 lock-rest.png@42,1573,1122,346
swift scripts/screenshots/compose.swift page docs/screenshots/dashboard.png dashboard.png
```
