import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { ensureBootstrapped } from "@/lib/bootstrap";
import { Shell } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  ensureBootstrapped();
  if (!(await currentUser())) redirect("/");
  return <Shell>{children}</Shell>;
}
