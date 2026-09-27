import { ingestCsvText, ingestSampleDataset } from "@/lib/ingest";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  try {
    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const file = form.get("file");
      if (!(file instanceof File)) {
        return Response.json({ error: "No file uploaded" }, { status: 400 });
      }
      const text = await file.text();
      const result = await ingestCsvText(text, file.name);
      return Response.json(result);
    }

    const body = (await request.json().catch(() => ({}))) as { sample?: boolean };
    if (body.sample) {
      return Response.json(await ingestSampleDataset());
    }
    return Response.json({ error: "Send multipart file or { sample: true }" }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Ingestion failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
