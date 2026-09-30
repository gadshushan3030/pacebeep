import type { Metadata } from "next";

export const metadata: Metadata = { title: "Terms of Service – PaceBeep" };

const CONTACT = "2713065@gmail.com";

export default function Terms() {
  return (
    <>
      <h1>Terms of Service</h1>
      <p className="muted text-sm">Last updated: 30 September 2026</p>

      <p>
        These terms apply to the hosted PaceBeep service at pacebeep.vercel.app, run by Gad Shushan (&ldquo;we&rdquo;). By creating an
        account or using the service you agree to them. Questions: <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.
      </p>

      <h2>The service</h2>
      <p>
        PaceBeep lets you plan interval runs, record runs and connect AI assistants that can read and write your training data. It is
        free, provided as is, and may change or stop at any time. The source code is open source under the MIT License; that license
        covers the code, and these terms cover the hosted service.
      </p>

      <h2>Not medical advice</h2>
      <p>
        PaceBeep and any assistant you connect give general training information, not medical advice. Running and interval training
        carry a risk of injury. Check with a doctor before starting or changing training, listen to your body, and stop if you feel
        pain, dizziness or shortness of breath. Suggestions from AI assistants can be wrong; you decide what to do.
      </p>

      <h2>Your account</h2>
      <ul>
        <li>Keep your sign-in secure; you are responsible for what happens in your account.</li>
        <li>You own the training data you add. You let us store and process it only to provide the service to you.</li>
        <li>You can delete your account at any time from the Account page.</li>
      </ul>

      <h2>AI assistants</h2>
      <p>
        Assistants act only after you approve them, and only within your account. Their providers are third parties with their own
        terms. You are responsible for which assistants you connect; you can disconnect them at any time.
      </p>

      <h2>Acceptable use</h2>
      <ul>
        <li>Do not try to access other users&rsquo; data or the service&rsquo;s systems beyond what the app offers you.</li>
        <li>Do not overload, disrupt or misuse the service, or use it for anything illegal.</li>
      </ul>
      <p>We may suspend or close accounts that break these rules.</p>

      <h2>No warranty and limitation of liability</h2>
      <p>
        The service is provided &ldquo;as is&rdquo; without warranties of any kind. To the extent the law allows, we are not liable for
        indirect or consequential damages, lost data or injuries arising from use of the service or of training suggestions.
      </p>

      <h2>Changes and law</h2>
      <p>
        We may update these terms; the date above shows the current version, and continued use means you accept the update. These terms
        are governed by the laws of the State of Israel.
      </p>
    </>
  );
}
