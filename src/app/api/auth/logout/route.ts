import { NextResponse } from "next/server";
import { handle } from "@/lib/api";
import { SESSION_COOKIE } from "@/lib/auth";

export const POST = handle(() => {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(SESSION_COOKIE);
  return res;
});
