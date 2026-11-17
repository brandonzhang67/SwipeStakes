import { body, handle } from "@/lib/api";
import { quote } from "@/lib/parlay";

export const POST = handle(async (req) => {
  const b = await body<{ legs: unknown }>(req);
  return { quote: await quote(b.legs) };
});
