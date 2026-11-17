"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { api, fmt, timeAgo, usePoll } from "./client";

export type Me = {
  user: {
    id: number;
    netid: string;
    displayName: string;
    college: string;
    is21: boolean;
    dailyLimitCents: number;
    selfExcludedUntil: string | null;
  };
  wallet: { swipes: number; cents: number };
  marketRateCents: number;
  stakedTodayCents: number;
  swipeFloor: number;
  maxDailyLimitCents: number;
};

export function useMe() {
  return usePoll<Me>("/api/me", 8000);
}

const NAV = [
  { href: "/home", label: "Home", icon: "🏠" },
  { href: "/market", label: "Trade", icon: "🔁" },
  { href: "/flip", label: "Flip", icon: "🪙" },
  { href: "/jackpot", label: "Jackpot", icon: "🎟️" },
  { href: "/parlays", label: "Weather", icon: "🌦️" },
];

export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const { data: me } = useMe();
  return (
    <div className="mx-auto flex min-h-dvh max-w-3xl flex-col">
      <header className="sticky top-0 z-10 bg-yale px-4 py-3 text-white shadow">
        <div className="flex items-center justify-between gap-3">
          <Link href="/home" className="text-lg font-black tracking-tight">
            Swipe<span className="text-gold">Stakes</span>
          </Link>
          {me && (
            <div className="flex items-center gap-2 text-sm">
              <span className="rounded-full bg-white/15 px-3 py-1 font-semibold">🍽️ {me.wallet.swipes}</span>
              <span className="rounded-full bg-white/15 px-3 py-1 font-semibold">💵 {fmt(me.wallet.cents)}</span>
              <Link href="/settings" className="rounded-full bg-white/15 px-2 py-1" aria-label="Settings">
                ⚙️
              </Link>
            </div>
          )}
        </div>
      </header>
      <main className="flex-1 px-4 pt-4 pb-28">{children}</main>
      <nav
        className="fixed inset-x-0 bottom-0 z-10 border-t"
        style={{ background: "var(--surface)", borderColor: "var(--border)" }}
      >
        <div className="mx-auto flex max-w-3xl justify-around py-2">
          {NAV.map((n) => {
            const active = path.startsWith(n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                className={`flex flex-col items-center rounded-xl px-3 py-1 text-xs font-semibold ${active ? "text-yale-light" : "muted"}`}
              >
                <span className="text-xl leading-none">{n.icon}</span>
                {n.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

export function PageTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-4">
      <h1 className="text-2xl font-black tracking-tight">{title}</h1>
      {subtitle && <p className="muted mt-1 text-sm">{subtitle}</p>}
    </div>
  );
}

export function Alert({ error, message }: { error?: string | null; message?: string | null }) {
  if (error) return <p className="mt-3 rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">{error}</p>;
  if (message)
    return <p className="mt-3 rounded-xl bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400">{message}</p>;
  return null;
}

type FeedEvent = { id: number; kind: string; message: string; created_at: string };
const ICON: Record<string, string> = { trade: "🔁", offer: "📋", coinflip: "🪙", jackpot: "🎟️", parlay: "🌦️", join: "👋" };

export function Feed({ limit = 12 }: { limit?: number }) {
  const { data } = usePoll<{ events: FeedEvent[] }>("/api/feed", 4000);
  return (
    <div className="card">
      <h2 className="mb-2 font-bold">Live on campus</h2>
      {!data && <p className="muted text-sm">Loading…</p>}
      <ul className="space-y-2">
        {data?.events.slice(0, limit).map((e) => (
          <li key={e.id} className="flex items-start gap-2 text-sm">
            <span>{ICON[e.kind] ?? "•"}</span>
            <span className="flex-1">{e.message}</span>
            <span className="muted shrink-0 text-xs">{timeAgo(e.created_at)}</span>
          </li>
        ))}
        {data && data.events.length === 0 && <li className="muted text-sm">Nothing yet. Be the first.</li>}
      </ul>
    </div>
  );
}

export async function logout() {
  await api("/api/auth/logout", { method: "POST" });
  window.location.href = "/";
}
