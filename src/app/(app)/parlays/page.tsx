"use client";

import { useEffect, useMemo, useState } from "react";
import { api, fmt, hourLabel, useAction, usePoll } from "@/components/client";
import { Alert, PageTitle, useMe } from "@/components/ui";

type Hour = { time: string; date: string; hour: number; tempF: number; precipProb: number | null };
type Board = { source: "open-meteo" | "mock"; fetchedAt: string; days: string[]; hours: Hour[]; location: string };

type Leg =
  | { kind: "rain"; date: string; startHour: number; endHour: number; pick: "yes" | "no" }
  | { kind: "temp"; date: string; startHour: number; endHour: number; op: "over" | "under" | "between"; low: number; high?: number };

type QuotedLeg = Leg & { label: string; probability: number; odds: number; forecast: { highF?: number; sigma?: number; maxPrecipProb?: number } };
type Quote = { legs: QuotedLeg[]; odds: number; probability: number; source: string };

type MyParlay = {
  id: number;
  stake_swipes: number;
  stake_cents: number;
  stake_value_cents: number;
  odds: number;
  potential_payout_cents: number;
  status: "open" | "won" | "lost" | "void";
  created_at: string;
  legs: {
    id: number;
    label: string;
    probability: number;
    odds: number;
    outcome: "pending" | "won" | "lost" | "void";
    forecast: { highF?: number; maxPrecipProb?: number };
    observed: { highF?: number; totalPrecipIn?: number } | null;
  }[];
};

const OUTCOME: Record<string, string> = { pending: "⏳", won: "✅", lost: "❌", void: "↩️" };

export default function Parlays() {
  const { data: board, error: boardError } = usePoll<Board>("/api/weather", 5 * 60_000);
  const { data: mine } = usePoll<{ parlays: MyParlay[] }>("/api/parlays", 15_000);
  const { data: me } = useMe();
  const act = useAction();

  const [dayIdx, setDayIdx] = useState(0);
  const [legs, setLegs] = useState<Leg[]>([]);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [stakeKind, setStakeKind] = useState<"cents" | "swipes">("cents");
  const [stakeAmount, setStakeAmount] = useState("5");

  // Leg builder state
  const [kind, setKind] = useState<"rain" | "temp">("rain");
  const [start, setStart] = useState<number | null>(null);
  const [end, setEnd] = useState<number | null>(null);
  const [pick, setPick] = useState<"yes" | "no">("yes");
  const [op, setOp] = useState<"over" | "under" | "between">("between");
  const [low, setLow] = useState("");
  const [high, setHigh] = useState("");

  const day = board?.days[dayIdx];
  const dayHours = useMemo(() => board?.hours.filter((h) => h.date === day) ?? [], [board, day]);

  // Default the window to the first available hour of the chosen day.
  useEffect(() => {
    if (dayHours.length && (start === null || !dayHours.some((h) => h.hour === start))) {
      setStart(dayHours[0].hour);
      setEnd(Math.min(24, dayHours[0].hour + 1));
    }
  }, [dayHours, start]);

  const forecastHigh = useMemo(() => {
    if (!board || start === null || end === null || !day) return null;
    const temps = board.hours.filter((h) => h.date === day && h.hour >= start && h.hour <= end).map((h) => h.tempF);
    return temps.length ? Math.max(...temps) : null;
  }, [board, day, start, end]);

  // Suggest thresholds around the forecast.
  useEffect(() => {
    if (forecastHigh === null) return;
    const r = Math.round(forecastHigh);
    setLow(String(op === "between" ? r - 1 : r));
    setHigh(String(r + 1));
  }, [forecastHigh, op]);

  // Live quote.
  useEffect(() => {
    if (legs.length === 0) {
      setQuote(null);
      setQuoteError(null);
      return;
    }
    let cancelled = false;
    api<{ quote: Quote }>("/api/parlays/quote", { body: { legs } })
      .then((r) => !cancelled && (setQuote(r.quote), setQuoteError(null)))
      .catch((e) => !cancelled && (setQuote(null), setQuoteError(e.message)));
    return () => {
      cancelled = true;
    };
  }, [legs]);

  function buildLeg(): Leg | null {
    if (!day || start === null || end === null) return null;
    if (kind === "rain") return { kind, date: day, startHour: start, endHour: end, pick };
    const leg: Leg = { kind, date: day, startHour: start, endHour: end, op, low: Number(low) };
    if (op === "between") leg.high = Number(high);
    return leg;
  }

  function preset(which: "rain" | "temp") {
    if (!board) return;
    // 8pm-9pm tonight if it hasn't started, otherwise tomorrow.
    const idx = board.hours.some((h) => h.date === board.days[0] && h.hour === 20) ? 0 : 1;
    const d = board.days[idx];
    const temps = board.hours.filter((h) => h.date === d && (h.hour === 20 || h.hour === 21)).map((h) => h.tempF);
    const r = Math.round(temps.length ? Math.max(...temps) : 45);
    const leg: Leg =
      which === "rain"
        ? { kind: "rain", date: d, startHour: 20, endHour: 21, pick: "yes" }
        : { kind: "temp", date: d, startHour: 20, endHour: 21, op: "between", low: r - 1, high: r + 1 };
    setLegs((ls) => [...ls, leg]);
  }

  const stakeValue =
    stakeKind === "cents" ? Math.round(Number(stakeAmount) * 100) : Number(stakeAmount) * (me?.marketRateCents ?? 0);
  const payout = quote ? Math.round(stakeValue * quote.odds) : 0;

  return (
    <>
      <PageTitle
        title="Weather parlays"
        subtitle={`Bet on ${board?.location ?? "New Haven"} weather. Stack legs; every one has to hit. Odds come straight from the forecast with no house edge.`}
      />

      {boardError && <Alert error={boardError} />}
      {board?.source === "mock" && (
        <p className="mb-3 rounded-xl bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
          Using mock weather (WEATHER_PROVIDER=mock). Set it to open-meteo for real New Haven forecasts.
        </p>
      )}

      {board && (
        <div className="card mb-4">
          <div className="seg mb-3">
            {board.days.map((d, i) => (
              <button key={d} aria-pressed={dayIdx === i} onClick={() => setDayIdx(i)}>
                {i === 0 ? "Today" : "Tomorrow"}
              </button>
            ))}
          </div>
          <div className="-mx-1 flex gap-1 overflow-x-auto pb-1">
            {dayHours.map((h) => {
              const inWindow = start !== null && end !== null && h.hour >= start && h.hour < end;
              return (
                <button
                  key={h.time}
                  onClick={() => {
                    setStart(h.hour);
                    setEnd(Math.min(24, h.hour + 1));
                  }}
                  className={`flex w-14 shrink-0 flex-col items-center rounded-xl border px-1 py-2 text-xs ${inWindow ? "border-yale-light bg-yale-light/10" : ""}`}
                  style={inWindow ? undefined : { borderColor: "var(--border)" }}
                >
                  <span className="muted font-semibold">{hourLabel(h.hour)}</span>
                  <span className="mt-1 text-sm font-bold">{Math.round(h.tempF)}°</span>
                  <div className="mt-1 flex h-8 w-2 items-end overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
                    <div className="w-full rounded-full bg-sky-500" style={{ height: `${h.precipProb ?? 0}%` }} />
                  </div>
                  <span className="muted mt-1">{h.precipProb ?? 0}%</span>
                </button>
              );
            })}
            {dayHours.length === 0 && <p className="muted text-sm">No hours left today. Try tomorrow.</p>}
          </div>
        </div>
      )}

      {board && (
        <div className="card mb-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-bold">Add a leg</h2>
            <div className="flex gap-1">
              <button className="btn-ghost px-2 py-1 text-xs" onClick={() => preset("rain")}>
                ☔ Rain 8–9pm?
              </button>
              <button className="btn-ghost px-2 py-1 text-xs" onClick={() => preset("temp")}>
                🌡️ High 8–9pm
              </button>
            </div>
          </div>
          <div className="seg">
            <button aria-pressed={kind === "rain"} onClick={() => setKind("rain")}>
              ☔ Rain
            </button>
            <button aria-pressed={kind === "temp"} onClick={() => setKind("temp")}>
              🌡️ Temperature high
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label">From</label>
              <select
                className="input"
                value={start ?? ""}
                onChange={(e) => {
                  const s = Number(e.target.value);
                  setStart(s);
                  if (end === null || end <= s || end - s > 12) setEnd(Math.min(24, s + 1));
                }}
              >
                {dayHours.map((h) => (
                  <option key={h.hour} value={h.hour}>
                    {hourLabel(h.hour)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">To</label>
              <select className="input" value={end ?? ""} onChange={(e) => setEnd(Number(e.target.value))}>
                {start !== null &&
                  Array.from({ length: Math.min(12, 24 - start) }, (_, i) => start + i + 1).map((h) => (
                    <option key={h} value={h}>
                      {h === 24 ? "midnight" : hourLabel(h)}
                    </option>
                  ))}
              </select>
            </div>
          </div>

          {kind === "rain" ? (
            <div className="seg">
              <button aria-pressed={pick === "yes"} onClick={() => setPick("yes")}>
                It rains
              </button>
              <button aria-pressed={pick === "no"} onClick={() => setPick("no")}>
                It stays dry
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="seg">
                {(["under", "between", "over"] as const).map((o) => (
                  <button key={o} aria-pressed={op === o} onClick={() => setOp(o)}>
                    {o[0].toUpperCase() + o.slice(1)}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <input className="input" inputMode="decimal" value={low} onChange={(e) => setLow(e.target.value)} />
                {op === "between" && (
                  <>
                    <span className="muted">and</span>
                    <input className="input" inputMode="decimal" value={high} onChange={(e) => setHigh(e.target.value)} />
                  </>
                )}
                <span className="muted">°F</span>
              </div>
              {forecastHigh !== null && (
                <p className="muted text-xs">Forecast high for this window: {forecastHigh.toFixed(1)}°F</p>
              )}
            </div>
          )}
          <button
            className="btn-primary w-full"
            onClick={() => {
              const leg = buildLeg();
              if (leg) setLegs((ls) => [...ls, leg]);
            }}
          >
            + Add leg
          </button>
        </div>
      )}

      {legs.length > 0 && (
        <div className="card mb-4 ring-2 ring-gold">
          <h2 className="mb-2 font-bold">Your parlay</h2>
          <ul className="mb-3 space-y-2">
            {legs.map((l, i) => {
              const q = quote?.legs[i];
              return (
                <li key={i} className="flex items-start justify-between gap-2 text-sm">
                  <div>
                    <div className="font-semibold">{q?.label ?? "…"}</div>
                    {q && (
                      <div className="muted text-xs">
                        {Math.round(q.probability * 100)}% likely ·{" "}
                        {q.kind === "rain"
                          ? `peak rain chance ${q.forecast.maxPrecipProb}%`
                          : `forecast high ${q.forecast.highF}°F ± ${q.forecast.sigma}`}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {q && <span className="font-mono font-bold">{q.odds.toFixed(2)}x</span>}
                    <button className="muted" aria-label="Remove leg" onClick={() => setLegs((ls) => ls.filter((_, j) => j !== i))}>
                      ✕
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
          <Alert error={quoteError} />
          {quote && (
            <>
              <div className="mb-3 flex items-baseline justify-between border-t pt-3" style={{ borderColor: "var(--border)" }}>
                <span className="font-semibold">Parlay odds</span>
                <span className="text-2xl font-black">{quote.odds.toFixed(2)}x</span>
              </div>
              <div className="seg mb-2">
                <button aria-pressed={stakeKind === "cents"} onClick={() => (setStakeKind("cents"), setStakeAmount("5"))}>
                  Stake dining $
                </button>
                <button aria-pressed={stakeKind === "swipes"} onClick={() => (setStakeKind("swipes"), setStakeAmount("1"))}>
                  Stake swipes
                </button>
              </div>
              {stakeKind === "cents" ? (
                <div className="relative mb-2">
                  <span className="muted absolute top-2 left-3 text-sm">$</span>
                  <input className="input pl-6" inputMode="decimal" value={stakeAmount} onChange={(e) => setStakeAmount(e.target.value)} />
                </div>
              ) : (
                <div className="seg mb-2">
                  {["1", "2", "3"].map((n) => (
                    <button key={n} aria-pressed={stakeAmount === n} onClick={() => setStakeAmount(n)}>
                      {n} swipe{n === "1" ? "" : "s"}
                    </button>
                  ))}
                </div>
              )}
              <p className="muted mb-3 text-sm">
                Stake worth {fmt(stakeValue || 0)} → pays <b className="text-[color:var(--text)]">{fmt(payout || 0)}</b> in dining dollars if every leg hits (
                {(quote.probability * 100).toFixed(1)}% chance).
              </p>
              <button
                className="btn-gold w-full"
                disabled={act.busy}
                onClick={() =>
                  act.run(async () => {
                    const stake =
                      stakeKind === "cents" ? { cents: Math.round(Number(stakeAmount) * 100) } : { swipes: Number(stakeAmount) };
                    const r = await api<{ parlay: { payoutCents: number } }>("/api/parlays", { body: { legs, stake } });
                    setLegs([]);
                    return `Parlay placed. Pays ${fmt(r.parlay.payoutCents)} if it hits.`;
                  })
                }
              >
                Place parlay
              </button>
            </>
          )}
        </div>
      )}
      <Alert error={act.error} message={act.message} />

      <div className="card mt-4">
        <h2 className="mb-2 font-bold">My parlays</h2>
        <ul className="space-y-3">
          {mine?.parlays.map((p) => (
            <li key={p.id} className="rounded-xl border p-3 text-sm" style={{ borderColor: "var(--border)" }}>
              <div className="mb-1 flex justify-between">
                <span className="font-semibold">
                  {p.stake_swipes ? `${p.stake_swipes} swipe${p.stake_swipes > 1 ? "s" : ""}` : fmt(p.stake_cents)} @ {p.odds.toFixed(2)}x
                </span>
                <span
                  className={
                    p.status === "won" ? "font-bold text-emerald-600" : p.status === "lost" ? "text-red-500" : "muted"
                  }
                >
                  {p.status === "open" ? `to win ${fmt(p.potential_payout_cents)}` : p.status === "won" ? `won ${fmt(p.potential_payout_cents)}` : p.status}
                </span>
              </div>
              <ul className="space-y-0.5">
                {p.legs.map((l) => (
                  <li key={l.id} className="flex justify-between gap-2">
                    <span>
                      {OUTCOME[l.outcome]} {l.label}
                    </span>
                    <span className="muted shrink-0 text-xs">
                      {l.observed
                        ? l.observed.highF !== undefined
                          ? `actual ${l.observed.highF}°F`
                          : `${l.observed.totalPrecipIn}" rain`
                        : `${l.odds.toFixed(2)}x`}
                    </span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
          {mine?.parlays.length === 0 && <li className="muted text-sm">No parlays yet.</li>}
        </ul>
        <p className="muted mt-3 text-xs">
          Legs settle about an hour after their window closes, using observed hourly data from Open-Meteo. If no data
          arrives within a day, the parlay is voided and your stake is returned.
        </p>
      </div>
    </>
  );
}
