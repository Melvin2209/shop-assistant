import type { ToolCallRecord } from "@/lib/tools/tools";
import { checkGrounding } from "./grounding";
import { runMockAgent } from "./mock";
import { describeApiError, runRealAgent } from "./real";
import type { AgentEvent, AgentMode, AgentRunResult, ChatMessage } from "./types";

export type { AgentEvent, AgentMode, ChatMessage } from "./types";

/** Real mode needs an API key; ASSISTANT_MODE can force either mode. */
export function resolveMode(env: Record<string, string | undefined> = process.env): AgentMode {
  if (env.ASSISTANT_MODE === "mock") return "mock";
  if (env.ASSISTANT_MODE === "real") return "real";
  return env.ANTHROPIC_API_KEY ? "real" : "mock";
}

/**
 * Runs one assistant turn and streams events. Whatever the mode, the turn
 * ends with a grounding report (were all figures backed by tool data?) and a
 * "done" event.
 */
export async function* runAgent(
  history: ChatMessage[],
  { mode = resolveMode(), delayMs = 0 }: { mode?: AgentMode; delayMs?: number } = {},
): AsyncGenerator<AgentEvent> {
  const toolCalls: ToolCallRecord[] = [];
  let text = "";
  try {
    const inner = mode === "real" ? runRealAgent(history, toolCalls) : runMockAgent(history, toolCalls, { delayMs });
    for await (const event of inner) {
      if (event.type === "text") text += event.delta;
      yield event;
    }
  } catch (err) {
    console.error("[agent]", err);
    yield { type: "error", message: describeApiError(err) };
  }
  // Numbers the user typed (e.g. a budget) may be repeated in the answer.
  const userText = history
    .filter((m) => m.role === "user")
    .map((m) => m.content)
    .join("\n");
  yield { type: "grounding", report: checkGrounding(text, toolCalls, userText) };
  yield { type: "done", mode };
}

/** Collects a whole turn (used by tests and the eval script). */
export async function runAgentToCompletion(
  history: ChatMessage[],
  options?: { mode?: AgentMode },
): Promise<AgentRunResult & { error?: string }> {
  const result: AgentRunResult & { error?: string } = {
    text: "",
    toolCalls: [],
    grounding: { grounded: true, citedIds: [], unknownIds: [], ungroundedPrices: [], ungroundedSpecs: [] },
  };
  const inputs = new Map<string, unknown>(); // tool_call always comes before its tool_result
  for await (const event of runAgent(history, options)) {
    if (event.type === "text") result.text += event.delta;
    if (event.type === "tool_call") inputs.set(event.id, event.input);
    if (event.type === "tool_result") {
      result.toolCalls.push({ id: event.id, name: event.name, input: inputs.get(event.id), result: event.result });
    }
    if (event.type === "grounding") result.grounding = event.report;
    if (event.type === "error") result.error = event.message;
  }
  return result;
}
