import { connection } from "next/server";
import { resolveMode } from "@/lib/agent";
import { DEFAULT_MODEL } from "@/lib/agent/real";

/** GET /api/mode: tells the UI whether it talks to the mock or the real agent. */
export async function GET() {
  await connection(); // read the environment at request time, not at build time
  const mode = resolveMode();
  return Response.json({ mode, model: mode === "real" ? process.env.ANTHROPIC_MODEL || DEFAULT_MODEL : null });
}
