import OpenAI from "openai";

let client: OpenAI | null = null;

export function getAiClient(): OpenAI {
  if (!client) {
    client = new OpenAI({
      apiKey: process.env.NVIDIA_API_KEY ?? process.env.OPENAI_API_KEY ?? "missing-key",
      baseURL: process.env.NVIDIA_BASE_URL ?? "https://integrate.api.nvidia.com/v1",
      timeout: 90_000,
      maxRetries: 1,
    });
  }
  return client;
}

export function aiModel(): string {
  return process.env.AI_MODEL ?? "meta/llama-3.2-11b-vision-instruct";
}

export function aiConfigured(): boolean {
  return Boolean(process.env.NVIDIA_API_KEY || process.env.OPENAI_API_KEY);
}

export function extractJson(text: string): unknown | null {
  if (!text) return null;
  let t = text.trim();
  const fence = /```(?:json)?\s*([\s\S]*?)```/.exec(t);
  if (fence) t = fence[1].trim();
  const start = t.indexOf("{");
  const startArr = t.indexOf("[");
  const useArr = start === -1 || (startArr !== -1 && startArr < start);
  const open = useArr ? "[" : "{";
  const close = useArr ? "]" : "}";
  const i = t.indexOf(open);
  if (i === -1) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let j = i; j < t.length; j++) {
    const ch = t[j];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(t.slice(i, j + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}
