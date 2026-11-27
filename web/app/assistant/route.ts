// For an assistant that was told "be my coach in PaceBeep" and came to the site to find out how.
// Public and plain text: every other page here sends a visitor without a session to /login.
const text = `# PaceBeep for AI assistants

PaceBeep is a free iPhone interval timer for runners. It plays a workout as timed intervals and beeps at every change, also with the screen locked. A personal assistant can be the runner's coach: the assistant plans the workouts, the phone plays them, and each run comes back with the effort the runner reported (RPE), so the next week can be adjusted.

There are three ways in. All are free, and the runner starts each one.

1. Coach link: for any assistant that can open a URL or send an HTTP request.
   The runner makes the link (PaceBeep app: "Connect an assistant"; or ${process.env.BETTER_AUTH_URL}: Connected, "New coach link") and sends it to you in the chat. The link's first page says where their training is (one address further, so that a chat app previewing the link never receives it). There you see their recent runs and planned workouts, and how to add workouts: a POST, a form, or a plain GET. There is nothing to install and no sign-in on your side. A link ends after 30 days without use.

2. MCP: for an assistant that can add an MCP server.
   ${process.env.BETTER_AUTH_URL}/mcp · Streamable HTTP · OAuth 2.1 with dynamic client registration and PKCE. The runner signs in and allows the connection.

3. Paste: for an assistant that can only write text.
   In the app, "Paste a plan" gives the runner a prompt for you. They paste your answer back into the app.

If the runner has not sent you a coach link yet, asking them for one is the quickest start.

The app: https://apps.apple.com/app/pacebeep/id6818211974
Source: https://github.com/gadshushan3030/pacebeep
`;

export const GET = () => new Response(text, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
