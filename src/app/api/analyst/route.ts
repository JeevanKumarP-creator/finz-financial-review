import { loadHistory, runAnalyst, seedGreeting, clearHistory } from "@/lib/ai/analyst";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const [history, greeting] = await Promise.all([loadHistory(30), seedGreeting()]);
  return Response.json({ history, greeting });
}

export async function POST(request: Request): Promise<Response> {
  try {
    const body = (await request.json()) as { message?: string; clear?: boolean };
    if (body.clear) {
      await clearHistory();
      return Response.json({ history: [], greeting: await seedGreeting() });
    }
    const message = body.message?.trim();
    if (!message) return Response.json({ error: "message required" }, { status: 400 });
    const history = await loadHistory(16);
    const result = await runAnalyst(message, history);
    return Response.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Analyst failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
