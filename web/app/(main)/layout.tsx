import Link from "next/link";
import { logout } from "@/app/actions";
import { requireUser } from "@/lib/session";

const NAV = [
  { href: "/", label: "Dashboard" },
  { href: "/workouts", label: "Workouts" },
  { href: "/account", label: "Account" },
] as const;

export default async function MainLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5 px-4 pb-10 pt-[max(1rem,env(safe-area-inset-top))]">
      <nav className="flex items-center gap-1">
        {NAV.map((n) => (
          <Link key={n.href} href={n.href} className="rounded-xl px-3 py-2.5 font-medium hover:bg-black/5 dark:hover:bg-white/10">
            {n.label}
          </Link>
        ))}
        <span className="muted ms-auto hidden text-sm sm:inline">{user.email}</span>
        <form action={logout}>
          <button className="muted rounded-xl px-3 py-2.5 text-sm hover:bg-black/5 dark:hover:bg-white/10">Sign out</button>
        </form>
      </nav>
      <main className="flex flex-col gap-5">{children}</main>
    </div>
  );
}
