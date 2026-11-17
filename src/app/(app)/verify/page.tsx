"use client";

import { useEffect, useState } from "react";
import { api } from "@/components/client";
import { Alert, PageTitle } from "@/components/ui";

type Verify = {
  game: string;
  id: number;
  status: string;
  seedHash: string;
  serverSeed: string | null;
  message: string | null;
  roll: number | null;
  rule: string;
  outcome: string | null;
};

const hex = (buf: ArrayBuffer) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");

/** Recompute everything in the browser so you don't have to trust the server's numbers. */
async function check(v: Verify) {
  if (!v.serverSeed || !v.message) return null;
  const enc = new TextEncoder();
  const hash = hex(await crypto.subtle.digest("SHA-256", enc.encode(v.serverSeed)));
  const key = await crypto.subtle.importKey("raw", enc.encode(v.serverSeed), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = hex(await crypto.subtle.sign("HMAC", key, enc.encode(v.message)));
  const roll = parseInt(mac.slice(0, 13), 16) / 2 ** 52;
  return { hashOk: hash === v.seedHash, roll, rollOk: v.roll !== null && Math.abs(roll - v.roll) < 1e-12 };
}

export default function VerifyPage() {
  const [game, setGame] = useState("coinflip");
  const [id, setId] = useState("");
  const [v, setV] = useState<Verify | null>(null);
  const [res, setRes] = useState<Awaited<ReturnType<typeof check>>>(null);
  const [error, setError] = useState<string | null>(null);

  async function load(g: string, i: string) {
    setError(null);
    setV(null);
    setRes(null);
    try {
      const data = await api<Verify>(`/api/verify?game=${g}&id=${i}`);
      setV(data);
      setRes(await check(data));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const g = q.get("game");
    const i = q.get("id");
    if (g && i) {
      setGame(g);
      setId(i);
      load(g, i);
    }
  }, []);

  return (
    <>
      <PageTitle title="Verify a result" subtitle="Your browser recomputes the hash and the roll. Nothing here relies on trusting us." />
      <div className="card mb-4 flex gap-2">
        <select className="input w-36" value={game} onChange={(e) => setGame(e.target.value)}>
          <option value="coinflip">Coin flip</option>
          <option value="jackpot">Jackpot</option>
        </select>
        <input className="input" placeholder="Game #" value={id} onChange={(e) => setId(e.target.value)} />
        <button className="btn-primary" onClick={() => load(game, id)}>
          Check
        </button>
      </div>
      <Alert error={error} />
      {v && (
        <div className="card space-y-2 text-sm">
          <Row k="Published hash (before the game)" v={v.seedHash} />
          <Row k="Revealed seed" v={v.serverSeed ?? "Hidden until the game resolves"} />
          {v.message && <Row k="HMAC message" v={v.message} />}
          {v.roll !== null && <Row k="Roll" v={v.roll.toFixed(12)} />}
          <Row k="Rule" v={v.rule} />
          {v.outcome && <Row k="Outcome" v={v.outcome} />}
          {res && (
            <div className="mt-2 space-y-1 rounded-xl bg-black/5 p-3 dark:bg-white/5">
              <p>{res.hashOk ? "✅" : "❌"} sha256(seed) matches the published hash</p>
              <p>
                {res.rollOk ? "✅" : "❌"} HMAC-SHA256(seed, message) gives roll {res.roll.toFixed(12)}
              </p>
            </div>
          )}
        </div>
      )}
    </>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <div className="label">{k}</div>
      <code className="break-all">{v}</code>
    </div>
  );
}
