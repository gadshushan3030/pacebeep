# Launch plan: getting PaceBeep in front of runners and developers

PaceBeep 1.0 went live on the App Store on 2026-11-05. It is free, open source (MIT) and has no ads, subscription or tracking. This file is the plan for telling people, with ready-to-paste posts. Everything here is a draft: read it, make it yours, then post from your own accounts.

Links to use everywhere:

- App Store: https://apps.apple.com/app/pacebeep/id6818211974
- GitHub: https://github.com/gadshushan3030/pacebeep
- Web: https://pacebeep.vercel.app

## 0. Before the first post (one hour)

- [ ] GitHub repo → About → add topics so people searching find it:
  ```bash
  gh repo edit gadshushan3030/pacebeep --add-topic ios,swift,swiftui,live-activities,interval-training,ai-coach,claude,open-source
  ```
- [ ] GitHub repo → Settings → Social preview: upload `docs/screenshots/app.png` (1280×640 works best; crop if needed). This is the image Reddit, X and LinkedIn show when the repo link is pasted.
- [ ] Pin the repo on your GitHub profile (profile → Customize your pins).
- [ ] Merge this PR so the README shows the App Store badge before anyone lands on it.
- [ ] App Store Connect → App Information → make sure the Marketing URL points at the GitHub repo or the web app, and the Support URL at GitHub Issues.
- [ ] Record a 20–30 s screen recording on the iPhone: a workout starting, the lock screen with the Live Activity, a beep. Posts with video get several times the engagement of text.
- [ ] Reddit: posting the same link to many subreddits in one hour looks like spam and gets removed. Spread the posts over a week, one or two a day, and answer every comment within a few hours.

## 1. Hacker News: Show HN (highest value for the portfolio)

Post on a weekday, 14:00–16:00 Israel time (morning in the US). Title max 80 chars, no exclamation marks. Put the GitHub link as the URL, not the App Store.

**Title:** Show HN: PaceBeep – open-source iPhone interval timer your AI coach plans over MCP

**First comment (post it right after submitting):**

> I run intervals and got tired of typing them into a timer. PaceBeep is a free, open-source iOS app plus a small Next.js backend with an MCP server: you tell ChatGPT or Claude "plan my week", it writes the workouts into your account over OAuth, and the phone plays them with beeps that keep going with the screen locked. After each run the app sends back what actually happened and your RPE, so the coach can adjust.
>
> Things that were harder than I expected and might interest people here:
>
> - Background audio on iOS: timers die when the screen locks. I render the whole workout into one audio track (silence with beeps at exact offsets) and play it with the background audio mode, so iOS keeps the app alive and the beeps cannot drift.
> - Live Activities drop state updates with the screen off. The fix was to resend the state every 10 s; a staleDate fallback did not work.
> - OAuth 2.1 for agents: dynamic client registration, PKCE, a consent page, tokens bound to the /mcp audience, and a live consent check on every call so "Disconnect" works instantly.
> - App Review rejected it under Guideline 5 because the listing mentioned ChatGPT and China requires a deep-synthesis permit; the fix was to exclude China mainland.
>
> Stack: SwiftUI, Next.js 16, Better Auth, Postgres on Neon, Vercel. MIT. Happy to answer anything about the audio trick or the MCP/OAuth layer.

## 2. Reddit

### r/running (the biggest audience; read the self-promotion rule first, link in a comment if the rule asks for it)

**Title:** I built a free, open-source interval app where your AI coach plans the session and your phone just beeps

> Runner and developer here. I wanted interval sessions that I did not have to type into a timer every time, so I built PaceBeep: you ask ChatGPT or Claude to plan your week, the workouts show up in the app, and it beeps work/rest with the screen locked (lock screen shows the current interval: orange = run, blue = rest). After the run you rate how hard it felt and the coach sees it next time.
>
> It is free, no ads, no subscription, and the whole thing is open source if you want to see what it does with your data (answer: stores your workouts and runs, nothing else, and you can delete the account in one tap).
>
> Works without an AI coach too: every account starts with three classic sessions (400s, 1 km repeats, pyramid).
>
> iPhone only for now. Would love to hear what sessions you would want it to understand better.

### r/iOSProgramming

**Title:** How I made interval beeps survive the locked screen: render the whole workout as one audio file

> Shipped my first App Store app this week (PaceBeep, open source, link in comments) and the hardest part was not the UI. iOS stops your timers when the screen locks, and `UNUserNotificationCenter` is not precise enough for a beep that has to land on the second.
>
> What worked: render the whole workout into a single PCM buffer (silence with the beeps at their exact sample offsets), play it with `AVAudioPlayer` under the `audio` background mode. iOS keeps the app alive because audio is playing, and the beeps cannot drift because they are baked into the track. For gym workouts where a set ends on a tap, a silent loop keeps the session alive between stretches.
>
> Second lesson: Live Activities lose `update()` calls with the screen off (never in the simulator). Resending the state every 10 s fixed it; `staleDate` did not.
>
> Third: App Review took 5 weeks for a first-time developer account, including a "Guideline 5 – Legal" rejection because the listing mentions ChatGPT and China needs a permit for that. Excluding China mainland was the fix.
>
> Code is MIT: SwiftUI app + Next.js backend with OAuth 2.1 and an MCP server so ChatGPT/Claude can write workouts into it.

### r/swift

Same as r/iOSProgramming, shorter title: **Interval timer that survives the lock screen by rendering beeps into one audio track (open source)**

### r/ClaudeAI and r/ChatGPT

**Title:** I gave Claude/ChatGPT a running coach's hands: it writes interval workouts into my phone over MCP, the phone beeps them

> Open-source project: PaceBeep. The backend is an MCP server with OAuth (dynamic client registration + PKCE), so you connect it like any connector, approve it once, and then "plan me a 5k week, I ran 4 days last week and my long run felt like 7/10" becomes real workouts in the iPhone app. After each run the app reports what happened and your RPE back, so the next plan is based on what you actually did.
>
> The MCP tools: get_summary, plan_week, create_workout, update_workout, list_runs, record_run, add_run_feedback. Free app on the App Store, MIT on GitHub, and you can self-host the backend on Vercel + Neon free tiers.

### r/mcp

**Title:** PaceBeep: a multi-user MCP server with OAuth 2.1 (DCR, PKCE, consent, per-user revoke) and an iPhone app on the other end

> Most MCP servers are single-user and run locally. This one is hosted, multi-user, and the client is a native iPhone app. Things that might be useful to copy: Better Auth as the OAuth 2.1 server, RFC 8414 / RFC 9728 discovery, tokens bound to the /mcp audience, a live consent check per request so disconnect is instant, and idempotent writes with a request_id. The auth layer is also extracted as a template: github.com/gadshushan3030/mcp-oauth-starter.

### r/SideProject, r/opensource

**Title:** PaceBeep: free, open-source interval running app, now on the App Store after 5 weeks in review

Short version of the r/running post plus the two links.

## 3. Product Hunt

Launch on a Tuesday–Thursday, 00:01 PT (10:01 Israel time). Needs: logo (512×512), 3–5 screenshots from `docs/screenshots/`, the 30 s video.

- **Tagline (60 chars):** Your AI coach plans the intervals. Your phone beeps them.
- **Description:** PaceBeep is a free, open-source iPhone interval timer that your AI assistant can program. Connect ChatGPT or Claude once, ask for a week of training, and the workouts land in the app with beeps that keep going with the screen locked and a Live Activity on the lock screen. Each run and your RPE go back to the coach. No ads, no subscription, MIT licensed.
- **First comment:** the Show HN comment, minus the technical bullets.

## 4. X / LinkedIn

**X (thread opener):**
> Shipped my first App Store app today. PaceBeep: tell Claude or ChatGPT to plan your running week, your iPhone beeps the intervals with the screen locked, and the coach learns from how it went. Free, open source. 🧵 on the three iOS problems that almost killed it:

Then one tweet per lesson (background audio, Live Activity updates, App Review), ending with the two links.

**LinkedIn (portfolio voice):**
> After 5 weeks in App Review, PaceBeep is live. It is a free, open-source interval-running app: a SwiftUI iPhone client, a Next.js backend with an OAuth 2.1 MCP server, and Postgres on Neon, so ChatGPT or Claude can plan a runner's week and the phone plays it with beeps that survive the lock screen.
>
> What I learned: shipping a native app end to end (background audio, Live Activities, App Review), building a multi-user OAuth server for AI agents, and designing for idempotency so a phone with no signal never duplicates a run.
>
> App Store and GitHub links in the comments. Feedback and pull requests welcome.

## 5. Hebrew communities

- Facebook: "רצים" / "ריצה למתחילים" / "Runners Israel". Post in Hebrew, lead with "חינמי לגמרי, בלי פרסומות", screenshot of the lock screen.
- Facebook / Telegram developer groups: "מתכנתים ישראל", "iOS Developers Israel". Lead with the background-audio trick, link to GitHub.
- Hebrew draft for runners:

> בניתי אפליקציה חינמית ובקוד פתוח לאינטרוולים: אומרים ל-ChatGPT או Claude "תכנן לי שבוע", האימונים מגיעים לאייפון, והטלפון מצפצף עבודה/מנוחה גם כשהמסך נעול (במסך הנעילה רואים את האינטרוול הנוכחי). בסוף מדרגים כמה היה קשה והמאמן רואה את זה בתכנון הבא. בלי פרסומות, בלי מנוי, והקוד פתוח למי שרוצה לבדוק מה קורה עם הנתונים. אשמח לפידבק.

## 6. Directories and lists (one PR each, lasting traffic)

- awesome-mcp-servers (github.com/punkpeye/awesome-mcp-servers): add under Sports / Health.
- awesome-swift / awesome-swiftui: open-source iOS apps section.
- mcp.so, glama.ai/mcp/servers, smithery.ai: submit the server URL `https://pacebeep.vercel.app/mcp`.
- Open Source iOS Apps list (github.com/dkhamsing/open-source-ios-apps): category Health.

## 7. After posting

- Answer every comment the same day; the first 24 hours decide the ranking everywhere.
- Turn every bug report into an issue with a `good first issue` label where it fits; that is what makes a repo look alive to a recruiter.
- Add a "Press / mentions" section to the README once there is anything to link.
- Track: App Store Connect → Analytics (downloads by source), GitHub Insights → Traffic (referrers, stars).
