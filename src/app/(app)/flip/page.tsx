"use client";

import Link from "next/link";
import { useState } from "react";
import { api, fmt, timeAgo, useAction, usePoll } from "@/components/client";
import { Alert, PageTitle, useMe } from "@/components/ui";

type Flip = {
  id: number;
  maker_id: number;
  maker_side: "swipes" | "dd";
  swipes: number;
  cents: number;
  seed_hash: string;
  maker_name: string;
  taker_name: string | null;
  winner_id: number | null;
  winner_name: string | null;
  roll: number | null;
  resolved_at: string | null;
  created_at: string;
};
type Data = { open: Flip[]; recent: Flip[]; marketRateCents: number };

const s = (n: number) => `${n} swipe${n === 1 ? "" : "s"}`;

export default function FlipPage() {
  const { data } = usePoll<Data>("/api/coinflips", 4000);
  const { data: me } = useMe();
  const act = useAction();
  const [side, setSide] = useState<"swipes" | "dd">("swipes");
  const [n, setN] = useState(1);
  const [last, setLast] = useState<Flip | null>(null);

  return (
    <>
      <PageTitle title="Coin Flip" subtitle="Swipes vs. dining dollars at the market rate. 50/50, winner takes both, no house cut." />

      <div className="card mb-4">
        <h2 className="mb-3 font-bold">Open a flip</h2>
        <div className="seg mb-3">
          <button aria-pressed={side === "swipes"} onClick={() => setSide("swipes")}>
            I put up swipes
          </button>
          <button aria-pressed={side === "dd"} onClick={() => setSide("dd")}>
            I put up dining $
          </button>
        </div>
        <div className="seg mb-3">
          {[1, 2, 3].map((k) => (
            <button key={k} aria-pressed={n === k} onClick={() => setN(k)}>
              {s(k)}
            </button>
          ))}
        </div>
        {data && (
          <p className="muted mb-3 text-sm">
            {side === "swipes"
              ? `You stake ${s(n)}; your opponent stakes ${fmt(n * data.marketRateCents)}.`
              : `You stake ${fmt(n * data.marketRateCents)}; your opponent stakes ${s(n)}.`}{" "}
            Winner gets both.
          </p>
        )}
        <button
          className="btn-primary w-full"
          disabled={act.busy}
          onClick={() =>
            act.run(async () => {
              await api("/api/coinflips", { body: { side, swipes: n } });
              return "Flip is open. The seed hash is locked in, so the result can't be changed.";
            })
          }
        >
          Open flip
        </button>
        <Alert error={act.error} message={act.message} />
      </div>

      {last && (
        <div className={`card mb-4 text-center ${last.winner_id === me?.user.id ? "ring-2 ring-emerald-500" : "ring-2 ring-red-400"}`}>
          <div className="text-4xl">{last.winner_id === me?.user.id ? "🎉" : "😬"}</div>
          <div className="mt-1 text-lg font-black">
            {last.winner_id === me?.user.id ? `You won ${s(last.swipes)} + ${fmt(last.cents)}!` : `${last.winner_name} won this one.`}
          </div>
          <p className="muted text-sm">
            Roll {last.roll?.toFixed(6)} ({last.roll! < 0.5 ? "< 0.5: maker wins" : "≥ 0.5: taker wins"}) ·{" "}
            <Link className="underline" href={`/verify?game=coinflip&id=${last.id}`}>
              verify
            </Link>
          </p>
        </div>
      )}

      <div className="card mb-4">
        <h2 className="mb-2 font-bold">Open flips</h2>
        <ul className="space-y-3">
          {data?.open.map((f) => {
            const theyPut = f.maker_side === "swipes" ? s(f.swipes) : fmt(f.cents);
            const youPut = f.maker_side === "swipes" ? fmt(f.cents) : s(f.swipes);
            const mine = f.maker_id === me?.user.id;
            return (
              <li key={f.id} className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-semibold">
                    {f.maker_name} puts up {theyPut}
                  </div>
                  <div className="muted truncate text-xs">
                    {mine ? "Your flip" : `You'd put up ${youPut}`} · hash {f.seed_hash.slice(0, 12)}…
                  </div>
                </div>
                {mine ? (
                  <button
                    className="btn-ghost"
                    disabled={act.busy}
                    onClick={() => act.run(async () => void (await api(`/api/coinflips/${f.id}/cancel`, { method: "POST" })))}
                  >
                    Cancel
                  </button>
                ) : (
                  <button
                    className="btn-gold"
                    disabled={act.busy}
                    onClick={() =>
                      act.run(async () => {
                        const clientSeed = Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) =>
                          b.toString(16).padStart(2, "0"),
                        ).join("");
                        const r = await api<{ coinflip: Flip }>(`/api/coinflips/${f.id}/take`, { body: { clientSeed } });
                        setLast(r.coinflip);
                      })
                    }
                  >
                    Flip 🪙
                  </button>
                )}
              </li>
            );
          })}
          {data?.open.length === 0 && <li className="muted text-sm">No open flips. Start one above.</li>}
        </ul>
      </div>

      <div className="card">
        <h2 className="mb-2 font-bold">Recent results</h2>
        <ul className="space-y-1 text-sm">
          {data?.recent.map((f) => (
            <li key={f.id} className="flex justify-between gap-2">
              <span>
                {f.winner_name} beat {f.winner_name === f.maker_name ? f.taker_name : f.maker_name} ({s(f.swipes)} + {fmt(f.cents)})
              </span>
              <Link href={`/verify?game=coinflip&id=${f.id}`} className="muted shrink-0 underline">
                {timeAgo(f.resolved_at!)}
              </Link>
            </li>
          ))}
          {data?.recent.length === 0 && <li className="muted">No flips yet.</li>}
        </ul>
      </div>
    </>
  );
}
