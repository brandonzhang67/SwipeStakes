"use client";

import { useState } from "react";
import { api, fmt, timeAgo, useAction, usePoll } from "@/components/client";
import { Alert, PageTitle, useMe } from "@/components/ui";

type Offer = {
  id: number;
  maker_id: number;
  side: "sell_swipe" | "buy_swipe";
  price_cents: number;
  maker_name: string;
  maker_college: string;
  created_at: string;
};
type Data = {
  offers: Offer[];
  trades: { id: number; price_cents: number; created_at: string }[];
  marketRateCents: number;
};

export default function Market() {
  const { data } = usePoll<Data>("/api/offers", 4000);
  const { data: me } = useMe();
  const act = useAction();
  const [side, setSide] = useState<"sell_swipe" | "buy_swipe">("sell_swipe");
  const [price, setPrice] = useState("9.00");

  const sells = data?.offers.filter((o) => o.side === "sell_swipe") ?? [];
  const buys = data?.offers.filter((o) => o.side === "buy_swipe") ?? [];

  return (
    <>
      <PageTitle
        title="Straight trade"
        subtitle="One swipe for a fixed amount of dining dollars. No chance involved, open to everyone."
      />
      <div className="card mb-4">
        <div className="mb-3 flex items-baseline justify-between">
          <span className="font-bold">Post an offer</span>
          {data && <span className="muted text-sm">Market: {fmt(data.marketRateCents)} / swipe</span>}
        </div>
        <div className="seg mb-3">
          <button aria-pressed={side === "sell_swipe"} onClick={() => setSide("sell_swipe")}>
            Sell a swipe
          </button>
          <button aria-pressed={side === "buy_swipe"} onClick={() => setSide("buy_swipe")}>
            Buy a swipe
          </button>
        </div>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <span className="muted absolute top-2 left-3 text-sm">$</span>
            <input className="input pl-6" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
          </div>
          <button
            className="btn-primary"
            disabled={act.busy}
            onClick={() =>
              act.run(async () => {
                await api("/api/offers", { body: { side, priceCents: Math.round(Number(price) * 100) } });
                return "Offer posted. It's held in escrow until someone takes it.";
              })
            }
          >
            Post
          </button>
        </div>
        <Alert error={act.error} message={act.message} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Book
          title="Swipes for sale"
          hint="You pay dining dollars, get a swipe"
          offers={sells}
          meId={me?.user.id}
          verb="Buy"
          act={act}
        />
        <Book
          title="People buying swipes"
          hint="You give a swipe, get dining dollars"
          offers={buys}
          meId={me?.user.id}
          verb="Sell"
          act={act}
        />
      </div>

      <div className="card mt-4">
        <h2 className="mb-2 font-bold">Recent trades</h2>
        <ul className="space-y-1 text-sm">
          {data?.trades.map((t) => (
            <li key={t.id} className="flex justify-between">
              <span>1 swipe → {fmt(t.price_cents)}</span>
              <span className="muted">{timeAgo(t.created_at)}</span>
            </li>
          ))}
          {data?.trades.length === 0 && <li className="muted">No trades yet. Yours sets the price.</li>}
        </ul>
      </div>
    </>
  );
}

function Book({
  title,
  hint,
  offers,
  meId,
  verb,
  act,
}: {
  title: string;
  hint: string;
  offers: Offer[];
  meId?: number;
  verb: string;
  act: ReturnType<typeof useAction>;
}) {
  return (
    <div className="card">
      <h2 className="font-bold">{title}</h2>
      <p className="muted mb-3 text-xs">{hint}</p>
      <ul className="space-y-2">
        {offers.map((o) => (
          <li key={o.id} className="flex items-center justify-between gap-2">
            <div>
              <div className="font-bold">{fmt(o.price_cents)}</div>
              <div className="muted text-xs">
                {o.maker_name} · {o.maker_college}
              </div>
            </div>
            {o.maker_id === meId ? (
              <button
                className="btn-ghost"
                disabled={act.busy}
                onClick={() => act.run(async () => void (await api(`/api/offers/${o.id}/cancel`, { method: "POST" })))}
              >
                Cancel
              </button>
            ) : (
              <button
                className="btn-gold"
                disabled={act.busy}
                onClick={() =>
                  act.run(async () => {
                    await api(`/api/offers/${o.id}/accept`, { method: "POST" });
                    return `Done: ${verb === "Buy" ? "bought" : "sold"} a swipe for ${fmt(o.price_cents)}.`;
                  })
                }
              >
                {verb}
              </button>
            )}
          </li>
        ))}
        {offers.length === 0 && <li className="muted text-sm">None right now.</li>}
      </ul>
    </div>
  );
}
