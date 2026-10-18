import Anthropic from "@anthropic-ai/sdk";
import { TOOL_DEFINITIONS } from "@/lib/tools/definitions";
import { executeTool, type ToolCallRecord, type ToolName } from "@/lib/tools/tools";
import { SYSTEM_PROMPT } from "./prompt";
import type { AgentEvent, ChatMessage } from "./types";

/** Cheap, fast model by default; override with ANTHROPIC_MODEL. */
export const DEFAULT_MODEL = "claude-haiku-5-5";
/** Safety net against tool-call loops: a shopping answer never needs more. */
const MAX_TOOL_ROUNDS = 6;

/**
 * The real agent: a hand-written tool-use loop over the Anthropic Messages API.
 *
 * 1. Send the conversation + tool definitions, stream the text back.
 * 2. If the model asks for tools, run them locally and send the results back.
 * 3. Repeat until the model answers without calling a tool.
 *
 * Within a turn the message list is append-only: assistant content (including
 * any thinking blocks) is sent back untouched, as the API requires.
 */
export async function* runRealAgent(
  history: ChatMessage[],
  toolCalls: ToolCallRecord[],
  client = new Anthropic(),
): AsyncGenerator<AgentEvent> {
  const model = process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;
  // Previous turns are replayed as plain text. Product ids cited in earlier
  // answers ("[P0012]") let the model resolve follow-ups like "add it to my cart".
  const messages: Anthropic.MessageParam[] = history.map((m) => ({ role: m.role, content: m.content }));

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const stream = client.messages.stream({
      model,
      max_tokens: 8000,
      // Low effort: shopping answers are short and latency matters more than deep reasoning.
      output_config: { effort: "low" },
      system: SYSTEM_PROMPT,
      tools: TOOL_DEFINITIONS,
      messages,
    });

    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        yield { type: "text", delta: event.delta.text };
      }
    }
    const message = await stream.finalMessage();

    if (message.stop_reason === "refusal") {
      yield { type: "text", delta: "Sorry, I can't help with that. I can help you find products in our store." };
      return;
    }

    const toolUses = message.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    if (toolUses.length === 0) return; // final answer

    // A tool input cut off by max_tokens may still look valid: never run it.
    if (message.stop_reason === "max_tokens") {
      yield { type: "error", message: "The answer was cut off. Please try a more specific question." };
      return;
    }

    messages.push({ role: "assistant", content: message.content });

    // All tool results of one round go back in a single user message.
    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const use of toolUses) {
      const name = use.name as ToolName;
      yield { type: "tool_call", id: use.id, name, input: use.input };
      const result = executeTool(use.name, use.input); // validates input with zod
      toolCalls.push({ id: use.id, name, input: use.input, result });
      yield { type: "tool_result", id: use.id, name, result };
      results.push({
        type: "tool_result",
        tool_use_id: use.id,
        content: JSON.stringify(result.ok ? result.data : { error: result.error }),
        is_error: !result.ok,
      });
    }
    messages.push({ role: "user", content: results });
  }

  yield { type: "error", message: "Too many tool calls for one question. Please rephrase." };
}

/** Turns SDK errors into short messages that are safe to show to the user. */
export function describeApiError(err: unknown): string {
  if (err instanceof Anthropic.AuthenticationError) return "Invalid ANTHROPIC_API_KEY. Check your .env.local or remove it to use mock mode.";
  if (err instanceof Anthropic.RateLimitError) return "Rate limited by the API. Please retry in a moment.";
  if (err instanceof Anthropic.APIConnectionError) return "Could not reach the Anthropic API.";
  if (err instanceof Anthropic.APIError) return `API error (${err.status ?? "unknown"}). Please retry.`;
  return "Unexpected error.";
}
