import { z } from "zod";
import { resolveMode, runAgent } from "@/lib/agent";

// Basic abuse limits: this endpoint can spend API credits in real mode.
const requestSchema = z.object({
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1).max(4000) }))
    .min(1)
    .max(30)
    .refine((m) => m[m.length - 1].role === "user", "The last message must come from the user"),
});

/**
 * POST /api/chat
 * Body: { messages: [{ role, content }] }
 * Response: a stream of AgentEvent objects, one JSON object per line (NDJSON).
 */
export async function POST(request: Request) {
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  }

  const mode = resolveMode();
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      // In mock mode, a small delay per word makes the streaming visible.
      for await (const event of runAgent(parsed.data.messages, { mode, delayMs: mode === "mock" ? 12 : 0 })) {
        controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-cache" },
  });
}
