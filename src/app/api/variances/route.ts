import { allAdjacentVariances, computeVariance } from "@/lib/variance";
import { buildVarianceEvidence, explainVariance } from "@/lib/ai/explain";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request): Promise<Response> {
  const q = new URL(request.url).searchParams;
  const from = q.get("from");
  const to = q.get("to");

  if (from && to) {
    const comparison = await computeVariance(from, to);
    if (!comparison) return Response.json({ error: `Cannot compare ${from} and ${to}` }, { status: 404 });
    const explain = q.get("explain") === "1";
    const explanation = explain ? await explainVariance(comparison) : null;
    return Response.json({ comparison, explanation, evidence: buildVarianceEvidence(comparison) });
  }

  const comparisons = await allAdjacentVariances();
  return Response.json({ comparisons });
}
