import { classifyBatch, countUnclassified } from "@/lib/ai/categorize";
import { scanReviewItems } from "@/lib/review";
import { aiConfigured, aiModel } from "@/lib/ai/client";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: Request): Promise<Response> {
  try {
    const body = (await request.json().catch(() => ({}))) as { limit?: number };
    const limit = Math.min(Math.max(Number(body.limit) || 60, 1), 200);
    const result = await classifyBatch(limit);
    const scan = await scanReviewItems();
    return Response.json({
      ...result,
      openReviewItems: scan.total,
      aiModel: aiConfigured() ? aiModel() : null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Classification failed";
    return Response.json({ error: message, remaining: await countUnclassified() }, { status: 500 });
  }
}

export async function GET(): Promise<Response> {
  return Response.json({
    remaining: await countUnclassified(),
    aiConfigured: aiConfigured(),
    model: aiConfigured() ? aiModel() : null,
  });
}
