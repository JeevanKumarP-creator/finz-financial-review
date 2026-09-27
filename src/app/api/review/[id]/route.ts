import { nowIso, qRun } from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, ctx: Ctx): Promise<Response> {
  const { id } = await ctx.params;
  const body = (await request.json().catch(() => ({}))) as { status?: string; resolution?: string };
  const status = body.status === "resolved" || body.status === "open" ? body.status : null;
  if (!status) return Response.json({ error: "status must be open or resolved" }, { status: 400 });

  const res = await qRun(
    `UPDATE review_items
     SET status = ?, resolution = ?, resolved_at = ?
     WHERE id = ?`,
    status,
    body.resolution ?? null,
    status === "resolved" ? nowIso() : null,
    Number(id)
  );
  if (res.changes === 0) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json({ ok: true });
}
