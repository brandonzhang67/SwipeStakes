import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { ensureBootstrapped } from "@/lib/bootstrap";
import { COLLEGES } from "@/lib/config";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default async function Landing() {
  ensureBootstrapped();
  if (await currentUser()) redirect("/home");
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-10">
      <div className="mb-8 text-center">
        <p className="text-5xl">🍽️ ⇄ 💵</p>
        <h1 className="mt-4 text-4xl font-black tracking-tight">
          Swipe<span className="text-gold">Stakes</span>
        </h1>
        <p className="muted mt-2">
          Turn the meal swipes you won&apos;t use into dining dollars. Trade them straight, flip for them, or bet
          on New Haven&apos;s weather.
        </p>
      </div>
      <LoginForm colleges={[...COLLEGES]} />
      <p className="muted mt-6 text-center text-xs">
        Hackathon demo: balances are simulated and no real swipes or money move. Games with a stake are 21+;
        straight trades and the free daily jackpot ticket are open to everyone.
      </p>
    </main>
  );
}
