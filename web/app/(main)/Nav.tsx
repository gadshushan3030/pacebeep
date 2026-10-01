"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/", label: "Dashboard", also: "/runs" },
  { href: "/workouts", label: "Workouts" },
  { href: "/account", label: "Account" },
] as const;

export function Nav() {
  const path = usePathname();
  return (
    <nav aria-label="Main" className="flex gap-1">
      {NAV.map((n) => {
        const active = n.href === "/" ? path === "/" || path.startsWith(n.also) : path.startsWith(n.href);
        return (
          <Link
            key={n.href}
            href={n.href}
            aria-current={active ? "page" : undefined}
            className={`flex min-h-11 items-center rounded-xl px-3.5 font-semibold ${active ? "bg-[var(--primary)] text-[var(--on-primary)]" : "hover:bg-black/5 dark:hover:bg-white/10"}`}
          >
            {n.label}
          </Link>
        );
      })}
    </nav>
  );
}
