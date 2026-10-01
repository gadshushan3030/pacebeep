import { requireUser } from "@/lib/session";
import { DeleteAccount } from "./DeleteAccount";

export default async function AccountPage() {
  const user = await requireUser();
  return (
    <>
      <h1 className="display text-[52px] [font-stretch:70%]">Account</h1>
      <section className="surface flex flex-col gap-1 p-4">
        <span className="font-medium">{user.email}</span>
        <span className="muted text-sm">{user.name}</span>
      </section>
      <section className="surface flex flex-col gap-3 p-4">
        <h2 className="display text-2xl [font-stretch:78%]">Delete account</h2>
        <p className="muted text-sm">
          Removes your account, all workouts, runs and feedback, and every assistant connection. This cannot be undone.
        </p>
        <DeleteAccount />
      </section>
    </>
  );
}
