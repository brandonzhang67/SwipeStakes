"use client";

import { useEffect, useState } from "react";
import { api, fmt, useAction } from "@/components/client";
import { Alert, PageTitle, logout, useMe } from "@/components/ui";

export default function Settings() {
  const { data: me } = useMe();
  const act = useAction();
  const [limit, setLimit] = useState("");

  useEffect(() => {
    if (me && limit === "") setLimit((me.user.dailyLimitCents / 100).toFixed(0));
  }, [me, limit]);

  if (!me) return <p className="muted">Loading…</p>;

  const save = (patch: Record<string, unknown>, msg: string) =>
    act.run(async () => {
      await api("/api/settings", { method: "PATCH", body: patch });
      return msg;
    });

  return (
    <>
      <PageTitle title="Play responsibly" subtitle="These limits only apply to games. Straight trades are never limited." />

      <div className="card mb-4">
        <h2 className="font-bold">Daily limit</h2>
        <p className="muted mb-3 text-sm">
          The most you can stake on games each day (swipes count at the market rate). Max {fmt(me.maxDailyLimitCents)}.
        </p>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <span className="muted absolute top-2 left-3 text-sm">$</span>
            <input className="input pl-6" inputMode="numeric" value={limit} onChange={(e) => setLimit(e.target.value)} />
          </div>
          <button
            className="btn-primary"
            disabled={act.busy}
            onClick={() => save({ dailyLimitCents: Math.round(Number(limit) * 100) }, "Daily limit updated.")}
          >
            Save
          </button>
        </div>
      </div>

      <div className="card mb-4">
        <h2 className="font-bold">Swipe floor</h2>
        <p className="muted text-sm">
          You can never stake swipes that would leave you with fewer than {me.swipeFloor}. They&apos;re for eating.
        </p>
      </div>

      <div className="card mb-4">
        <h2 className="font-bold">Take a break</h2>
        <p className="muted mb-3 text-sm">
          {me.user.selfExcludedUntil
            ? `Games are paused until ${new Date(me.user.selfExcludedUntil).toLocaleString()}. A pause can be extended but not shortened.`
            : "Pause all games. Once set, a pause can't be shortened."}
        </p>
        <div className="grid grid-cols-3 gap-2">
          {["24h", "7d", "30d"].map((p) => (
            <button
              key={p}
              className="btn-ghost"
              disabled={act.busy}
              onClick={() => {
                if (confirm(`Pause games for ${p}? This can't be undone.`)) save({ pause: p }, `Games paused for ${p}.`);
              }}
            >
              Pause {p}
            </button>
          ))}
        </div>
      </div>

      <div className="card mb-4">
        <h2 className="font-bold">Age</h2>
        <label className="mt-2 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={me.user.is21}
            onChange={(e) => save({ is21: e.target.checked }, "Saved.")}
          />
          I&apos;m 21 or older
        </label>
        <p className="muted mt-1 text-xs">Demo only: self-attested. A real launch would verify age before enabling stakes.</p>
      </div>

      <Alert error={act.error} message={act.message} />
      <button className="btn-ghost mt-2 w-full" onClick={logout}>
        Log out ({me.user.netid})
      </button>
    </>
  );
}
