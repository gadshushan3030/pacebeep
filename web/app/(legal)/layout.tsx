import Link from "next/link";

export default function LegalLayout({ children }: LayoutProps<"/">) {
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-4 px-5 py-10 leading-relaxed [&_h1]:text-2xl [&_h1]:font-bold [&_h2]:mt-4 [&_h2]:text-lg [&_h2]:font-semibold [&_li]:ms-5 [&_li]:list-disc [&_a]:underline">
      <Link href="/login" className="muted text-sm no-underline">← PaceBeep</Link>
      {children}
      <p className="muted mt-6 text-sm">
        <Link href="/privacy">Privacy</Link> · <Link href="/terms">Terms</Link>
      </p>
    </main>
  );
}
