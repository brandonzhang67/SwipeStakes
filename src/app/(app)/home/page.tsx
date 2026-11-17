"use client";

import Link from "next/link";
import { fmt } from "@/components/client";
import { Feed, PageTitle, useMe } from "@/components/ui";

const TILES = [
  { href: "/market", icon: "🔁", title: "Straight trade", body: "Swap a swipe for dining dollars at a fixed price. No luck involved." },
  { href: "/flip", icon: "🪙", title: "Coin Flip", body: "Your swipe vs. their dining dollars. 50/50, winner takes both." },
  { href: "/jackpot", icon: "🎟️", title: "Daily Jackpot", body: "One free ticket every day. Drawn at 9pm, sponsor-boosted." },
  { href: "/parlays", icon: "🌦️", title: "Weather parlays", body: "Will it rain at 8pm? Will the high top 45°F? Stack the legs." },
];

export default function Home() {
  const { data: me } = useMe();
  return (
    <>
      <PageTitle
        title={me ? `Hey ${me.user.displayName} 👋` : "Hey 👋"}
        subtitle={me ? `${me.user.college} · ${me.user.netid}` : undefined}
      />
      {me && (
        <div className="mb-4 grid grid-cols-3 gap-3">
          <Stat label="Swipes" value={String(me.wallet.swipes)} />
          <Stat label="Dining $" value={fmt(me.wallet.cents)} />
          <Stat label="1 swipe ≈" value={fmt(me.marketRateCents)} />
        </div>
      )}
      {me && (
        <div className="card mb-4">
          <div className="flex items-center justify-between text-sm">
            <span className="font-semibold">Played today</span>
            <span className="muted">
              {fmt(me.stakedTodayCents)} of {fmt(me.user.dailyLimitCents)}
            </span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
            <div
              className="h-full rounded-full bg-yale-light"
              style={{ width: `${Math.min(100, (me.stakedTodayCents / Math.max(1, me.user.dailyLimitCents)) * 100)}%` }}
            />
          </div>
          {!me.user.is21 && (
            <p className="muted mt-2 text-xs">
              Games with a stake are 21+. You can still trade and use your free jackpot ticket.
            </p>
          )}
          {me.user.selfExcludedUntil && (
            <p className="mt-2 text-xs text-amber-600">
              Games paused until {new Date(me.user.selfExcludedUntil).toLocaleString()}.
            </p>
          )}
        </div>
      )}
      <div className="mb-4 grid gap-3 sm:grid-cols-2">
        {TILES.map((t) => (
          <Link key={t.href} href={t.href} className="card transition hover:-translate-y-0.5 hover:shadow-md">
            <div className="text-2xl">{t.icon}</div>
            <div className="mt-1 font-bold">{t.title}</div>
            <p className="muted text-sm">{t.body}</p>
          </Link>
        ))}
      </div>
      <Feed />
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card text-center">
      <div className="text-xl font-black">{value}</div>
      <div className="muted text-xs font-semibold uppercase">{label}</div>
    </div>
  );
}
