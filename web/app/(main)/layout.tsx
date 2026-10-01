import Link from "next/link";
import { logout } from "@/app/actions";
import { Mark } from "@/app/Mark";
import { requireUser } from "@/lib/session";
import { Nav } from "./Nav";

export default async function MainLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  return (
    <div className="mx-auto flex max-w-[1120px] flex-col gap-9 px-5 pb-16 pt-[max(1.75rem,env(safe-area-inset-top))] sm:px-6">
      <header className="flex flex-wrap items-center gap-x-5 gap-y-3">
        <Link href="/" className="flex items-center gap-2.5">
          <Mark size={32} />
          <span className="display text-[23px] [font-stretch:80%]">PaceBeep</span>
        </Link>
        <Nav />
        <div className="ms-auto flex items-center gap-3">
          <span className="muted hidden text-sm sm:inline">{user.email}</span>
          <form action={logout}>
            <button className="btn btn-ghost text-sm">Sign out</button>
          </form>
        </div>
      </header>
      <main className="flex flex-col gap-9">{children}</main>
    </div>
  );
}
