import type { Metadata } from "next";

export const metadata: Metadata = { title: "Privacy Policy – PaceBeep" };

const CONTACT = "2713065@gmail.com";

export default function Privacy() {
  return (
    <>
      <h1>Privacy Policy</h1>
      <p className="muted text-sm">Last updated: 30 September 2026</p>

      <p>
        PaceBeep is an open-source interval-running app run by Gad Shushan. This page explains what data PaceBeep keeps, why, who
        else handles it, and how to delete it. Questions: <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li><strong>Account:</strong> your email address and name. If you sign in with Google, also your Google account id and profile picture link. If you use a password, only a one-way hash of it.</li>
        <li><strong>Sign-in sessions:</strong> a session cookie, and the IP address and browser/device description of each session.</li>
        <li><strong>Training data you or your assistant add:</strong> workout plans, runs (times, distance, per-interval durations and pace), and your feedback (effort rating and notes).</li>
        <li><strong>Assistant connections:</strong> which AI assistants you approved, when, and the access and refresh tokens issued to them.</li>
      </ul>
      <p>We do not use advertising, tracking or analytics cookies, and we do not collect location or health data from your device.</p>

      <h2>How we use it</h2>
      <p>
        Only to run PaceBeep for you: to sign you in, store and show your training, and let the assistants you approve read and write
        it. We do not sell your data, use it for advertising, or use it to train AI models.
      </p>

      <h2>Google sign-in</h2>
      <p>
        When you choose &ldquo;Continue with Google&rdquo;, Google shares your email address, name and profile picture with PaceBeep.
        We use them only to create and identify your account. PaceBeep&rsquo;s use of information received from Google APIs adheres to
        the{" "}
        <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noreferrer">
          Google API Services User Data Policy
        </a>
        , including the Limited Use requirements. We do not access your Gmail, Drive, contacts or any other Google data.
      </p>

      <h2>AI assistants you connect</h2>
      <p>
        If you connect an assistant (for example ChatGPT), you approve it on a consent screen, and it can then read and change your
        PaceBeep training data through PaceBeep&rsquo;s MCP interface. What the assistant&rsquo;s provider does with that data is
        governed by the provider&rsquo;s own terms and privacy policy. You can disconnect an assistant at any time from the dashboard;
        its access ends immediately.
      </p>

      <h2>Who else handles the data</h2>
      <ul>
        <li><strong>Vercel</strong> – hosts the app (United States).</li>
        <li><strong>Neon</strong> – hosts the database (United States, us-east-1).</li>
        <li><strong>Google</strong> – only if you use Google sign-in.</li>
      </ul>
      <p>We share data with no one else, unless the law requires it.</p>

      <h2>Keeping and deleting data</h2>
      <p>
        We keep your data while your account exists. <strong>Delete account</strong> on the Account page removes your account and all
        of your training data, sessions and assistant connections from the database right away. Backups kept by our database provider
        expire within its retention window. You can also ask us by email to see, correct or delete your data.
      </p>

      <h2>Security</h2>
      <p>
        Connections use HTTPS. Every request is checked against the signed-in user or the assistant token, so one user cannot read
        another user&rsquo;s data. Assistants never receive your password or a long-term key, only tokens you approved and can revoke.
      </p>

      <h2>Children</h2>
      <p>PaceBeep is not directed at children under 16, and we do not knowingly collect their data.</p>

      <h2>Changes</h2>
      <p>If this policy changes, we will update this page and its date. Significant changes will be shown in the app.</p>
    </>
  );
}
