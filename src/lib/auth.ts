import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { config } from "./config";
import { AppError } from "./errors";
import { getUser, type User } from "./users";

/**
 * Demo login: a signed cookie holding the user id. In production this is replaced by
 * Yale CAS (https://secure.its.yale.edu/cas), which hands us a verified NetID.
 */

export const SESSION_COOKIE = "ss_session";

function sign(value: string) {
  return createHmac("sha256", config.sessionSecret).update(value).digest("base64url");
}

export function sessionToken(userId: number): string {
  return `${userId}.${sign(String(userId))}`;
}

export function userIdFromToken(token: string | undefined): number | null {
  if (!token) return null;
  const [id, sig] = token.split(".");
  if (!id || !sig) return null;
  const expected = Buffer.from(sign(id));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  return Number(id);
}

export async function currentUser(): Promise<User | null> {
  const jar = await cookies();
  const id = userIdFromToken(jar.get(SESSION_COOKIE)?.value);
  if (!id) return null;
  const u = getUser(id);
  return u && !u.is_house ? u : null;
}

export async function requireUser(): Promise<User> {
  const u = await currentUser();
  if (!u) throw new AppError("Please log in", 401);
  return u;
}

export const NETID_RE = /^[a-z]{2,4}[0-9]{1,5}$/i;
