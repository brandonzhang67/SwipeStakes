"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export async function api<T = unknown>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(path, {
    method: init?.method ?? (init?.body ? "POST" : "GET"),
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
    body: init?.body ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && typeof window !== "undefined") window.location.href = "/";
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data as T;
}

/** Tell every polling widget (wallet, feed, …) to refresh now. */
export function refreshAll() {
  window.dispatchEvent(new Event("ss:refresh"));
}

/** Fetch `path` now, every `ms`, and whenever refreshAll() fires. */
export function usePoll<T>(path: string | null, ms = 5000) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);

  const load = useCallback(async () => {
    if (!path) return;
    try {
      const d = await api<T>(path);
      if (alive.current) {
        setData(d);
        setError(null);
      }
    } catch (e) {
      if (alive.current) setError((e as Error).message);
    }
  }, [path]);

  useEffect(() => {
    alive.current = true;
    load();
    const t = setInterval(load, ms);
    window.addEventListener("ss:refresh", load);
    return () => {
      alive.current = false;
      clearInterval(t);
      window.removeEventListener("ss:refresh", load);
    };
  }, [load, ms]);

  return { data, error, reload: load };
}

/** Run an async action with busy/error/success state. */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const run = useCallback(async (fn: () => Promise<string | void>) => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const msg = await fn();
      if (msg) setMessage(msg);
      refreshAll();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, []);
  return { busy, error, message, run };
}

export function fmt(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

export function timeAgo(iso: string) {
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function hourLabel(h: number) {
  const hh = h % 24;
  return `${hh % 12 === 0 ? 12 : hh % 12}${hh < 12 ? "am" : "pm"}`;
}
