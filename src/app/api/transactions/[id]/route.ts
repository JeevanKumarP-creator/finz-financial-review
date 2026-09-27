import { applyCorrection, getTransaction } from "@/lib/transactions";
import { scanReviewItems } from "@/lib/review";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, ctx: Ctx): Promise<Response> {
  const { id } = await ctx.params;
  const txn = await getTransaction(Number(id));
  if (!txn) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json({ transaction: txn });
}

export async function PATCH(request: Request, ctx: Ctx): Promise<Response> {
  const { id } = await ctx.params;
  const body = (await request.json().catch(() => ({}))) as { categoryId?: string; note?: string };
  if (!body.categoryId) return Response.json({ error: "categoryId required" }, { status: 400 });

  const result = await applyCorrection(Number(id), body.categoryId, body.note);
  if (!result.ok) return Response.json({ error: result.error }, { status: 400 });
  await scanReviewItems();
  return Response.json({ transaction: result.transaction });
}
