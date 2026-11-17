import { NextResponse, type NextRequest } from "next/server";
import { ensureBootstrapped } from "./bootstrap";
import { AppError } from "./errors";
import { resolveDueJackpots } from "./jackpot";
import { settleDueParlays } from "./parlay";

type Ctx = { params: Promise<Record<string, string>> };

/** Wrap a route handler: bootstrap, settle anything that's due, and turn errors into JSON. */
export function handle(fn: (req: NextRequest, params: Record<string, string>) => unknown) {
  return async (req: NextRequest, ctx: Ctx) => {
    try {
      ensureBootstrapped();
      resolveDueJackpots();
      await settleDueParlays();
      const result = await fn(req, (await ctx?.params) ?? {});
      if (result instanceof Response) return result;
      return NextResponse.json(result ?? { ok: true });
    } catch (e) {
      if (e instanceof AppError) return NextResponse.json({ error: e.message }, { status: e.status });
      console.error(e);
      return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
    }
  };
}

export async function body<T = Record<string, unknown>>(req: NextRequest): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new AppError("Expected a JSON body");
  }
}

export function idParam(params: Record<string, string>): number {
  const id = Number(params.id);
  if (!Number.isInteger(id) || id < 1) throw new AppError("Invalid id", 400);
  return id;
}
