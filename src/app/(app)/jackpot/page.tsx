"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, fmt, useAction, usePoll } from "@/components/client";
import { Alert, PageTitle } from "@/components/ui";

type State = {
  jackpot: {
    id: number;
    draw_date: string;
    draws_at: string;
    seed_hash: string;
    pot_swipes: number;
    pot_cents: number;
    sponsor_cents: number;
    total_tickets: number;
    players: number;
  };
  ticketPriceCents: number;
  myTickets: number;
  usedFreeEntry: boolean;
  paidTicketsLeft: number;
  previous: {
    id: number;
    draw_date: string;
    status: string;
    winner_name: string | null;
    winner_college: string | null;
    pot_swipes: number;
    prize_cents: number;
    total_tickets: number | null;
  } | null;
};

function useCountdown(iso?: string) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (!iso) return "";
  const s = Math.max(0, Math.floor((new Date(iso).getTime() - now) / 1000));
  return `${Math.floor(s / 3600)}h ${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}m ${String(s % 60).padStart(2, "0")}s`;
}

export default function JackpotPage() {
  const { data } = usePoll<State>("/api/jackpot", 5000);
  const act = useAction();
  const countdown = useCountdown(data?.jackpot.draws_at);
  const j = data?.jackpot;
  const odds = j && data.myTickets ? `${((data.myTickets / j.total_tickets) * 100).toFixed(1)}%` : "0%";

  const enter = (kind: "free" | "swipe" | "dd", count = 1) =>
    act.run(async () => {
      await api("/api/jackpot/enter", { body: { kind, count } });
      return kind === "free" ? "Free ticket in. Good luck tonight!" : "You're in. Good luck tonight!";
    });

  return (
    <>
      <PageTitle title="Daily Jackpot" subtitle="Drawn every night at 9pm. Every Yalie gets one free ticket a day, no purchase necessary." />

      {j && (
        <div className="card mb-4 bg-gradient-to-br from-yale to-yale-light text-center text-white" style={{ border: "none" }}>
          <div className="text-sm font-semibold uppercase opacity-80">Tonight&apos;s pot</div>
          <div className="mt-1 text-4xl font-black">
            {fmt(j.pot_cents + j.sponsor_cents)}
            {j.pot_swipes > 0 && <span className="text-gold"> + {j.pot_swipes} 🍽️</span>}
          </div>
          {j.sponsor_cents > 0 && <div className="mt-1 text-xs opacity-80">includes {fmt(j.sponsor_cents)} from the sponsor pool</div>}
          <div className="mt-3 font-mono text-lg">{countdown}</div>
          <div className="mt-1 text-xs opacity-80">
            {j.total_tickets} tickets · {j.players} players · your odds {odds}
          </div>
        </div>
      )}

      {data && (
        <div className="card mb-4 space-y-3">
          <button className="btn-gold w-full" disabled={act.busy || data.usedFreeEntry} onClick={() => enter("free")}>
            {data.usedFreeEntry ? "Free ticket used ✓" : "🎟️ Claim today's free ticket"}
          </button>
          <div className="grid grid-cols-2 gap-2">
            <button className="btn-primary" disabled={act.busy || data.paidTicketsLeft < 1} onClick={() => enter("swipe")}>
              +1 ticket for 1 swipe
            </button>
            <button className="btn-primary" disabled={act.busy || data.paidTicketsLeft < 1} onClick={() => enter("dd")}>
              +1 ticket for {fmt(data.ticketPriceCents)}
            </button>
          </div>
          <p className="muted text-center text-xs">
            You have {data.myTickets} ticket{data.myTickets === 1 ? "" : "s"}. {data.paidTicketsLeft} paid tickets left today.
          </p>
          <Alert error={act.error} message={act.message} />
        </div>
      )}

      {j && (
        <div className="card mb-4 text-sm">
          <h2 className="mb-1 font-bold">Provably fair</h2>
          <p className="muted">
            Tonight&apos;s seed is locked in. Its SHA-256 hash is{" "}
            <code className="break-all">{j.seed_hash}</code>. After the draw we reveal the seed so you can check it.
          </p>
        </div>
      )}

      {data?.previous && (
        <div className="card text-sm">
          <h2 className="mb-1 font-bold">Last draw · {data.previous.draw_date}</h2>
          {data.previous.status === "resolved" ? (
            <p>
              🏆 {data.previous.winner_name} ({data.previous.winner_college}) won {fmt(data.previous.prize_cents)}
              {data.previous.pot_swipes > 0 && ` + ${data.previous.pot_swipes} swipes`} from {data.previous.total_tickets} tickets.{" "}
              <Link className="underline" href={`/verify?game=jackpot&id=${data.previous.id}`}>
                Verify
              </Link>
            </p>
          ) : (
            <p className="muted">No entries, so the sponsor money went back to the pool.</p>
          )}
        </div>
      )}
    </>
  );
}
