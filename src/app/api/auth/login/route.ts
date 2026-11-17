import { NextResponse } from "next/server";
import { body, handle } from "@/lib/api";
import { NETID_RE, SESSION_COOKIE, sessionToken } from "@/lib/auth";
import { COLLEGES } from "@/lib/config";
import { AppError } from "@/lib/errors";
import { emit } from "@/lib/feed";
import { createUser, getUserByNetid } from "@/lib/users";

export const POST = handle(async (req) => {
  const b = await body<{ netid?: string; displayName?: string; college?: string; is21?: boolean }>(req);
  const netid = (b.netid ?? "").trim().toLowerCase();
  if (!NETID_RE.test(netid)) throw new AppError("That doesn't look like a Yale NetID (e.g. abc123)");

  let user = getUserByNetid(netid);
  if (!user) {
    const displayName = (b.displayName ?? "").trim().slice(0, 40);
    if (!displayName) throw new AppError("Pick a display name");
    if (!COLLEGES.includes(b.college as (typeof COLLEGES)[number])) throw new AppError("Pick your residential college");
    user = createUser({ netid, displayName, college: b.college!, is21: !!b.is21 });
    emit("join", `${user.display_name} from ${user.college} just joined`, user.id);
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, sessionToken(user.id), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
});
