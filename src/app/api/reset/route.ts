import { resetDatabase } from "@/lib/transactions";

export const dynamic = "force-dynamic";

export async function POST(): Promise<Response> {
  await resetDatabase();
  return Response.json({ ok: true });
}
