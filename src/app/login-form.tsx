"use client";

import { useState } from "react";
import { api } from "@/components/client";
import { Alert } from "@/components/ui";

export function LoginForm({ colleges }: { colleges: string[] }) {
  const [netid, setNetid] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [college, setCollege] = useState("");
  const [is21, setIs21] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/api/auth/login", { body: { netid, displayName, college, is21 } });
      window.location.href = "/home";
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="card space-y-3">
      <div>
        <label className="label" htmlFor="netid">Yale NetID</label>
        <input id="netid" className="input" placeholder="abc123" value={netid} onChange={(e) => setNetid(e.target.value)} autoComplete="username" />
        <p className="muted mt-1 text-xs">Demo login. The real app signs in through Yale CAS.</p>
      </div>
      <div>
        <label className="label" htmlFor="name">Display name <span className="normal-case">(first time only)</span></label>
        <input id="name" className="input" placeholder="Handsome Dan" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
      </div>
      <div>
        <label className="label" htmlFor="college">Residential college</label>
        <select id="college" className="input" value={college} onChange={(e) => setCollege(e.target.value)}>
          <option value="">Choose…</option>
          {colleges.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={is21} onChange={(e) => setIs21(e.target.checked)} />
        I&apos;m 21 or older (needed for games with a stake)
      </label>
      <button className="btn-primary w-full" disabled={busy}>
        {busy ? "Signing in…" : "Enter"}
      </button>
      <Alert error={error} />
    </form>
  );
}
