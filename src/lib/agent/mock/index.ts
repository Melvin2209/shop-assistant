import { executeTool, type ToolCallRecord, type ToolName, type ToolResult } from "@/lib/tools/tools";
import type { AgentEvent, ChatMessage } from "../types";
import { detectIntent } from "./intent";
import * as answers from "./respond";

/**
 * The mock agent: same contract as the real one (same tools, same events), but
 * the "reasoning" is a set of rules instead of an LLM. It lets anyone try the
 * demo without an API key and keeps tests free and deterministic.
 */
export async function* runMockAgent(
  history: ChatMessage[],
  toolCalls: ToolCallRecord[],
  { delayMs = 0 }: { delayMs?: number } = {},
): AsyncGenerator<AgentEvent> {
  // Calls a tool exactly like the real agent does and records it.
  async function* call(name: ToolName, input: unknown): AsyncGenerator<AgentEvent, ToolResult> {
    const id = `mock_${toolCalls.length + 1}`;
    yield { type: "tool_call", id, name, input };
    const result = executeTool(name, input);
    toolCalls.push({ id, name, input, result });
    yield { type: "tool_result", id, name, result };
    return result;
  }

  const intent = detectIntent(history);
  let answer: string;

  switch (intent.kind) {
    case "greeting":
      answer = answers.GREETING_ANSWER;
      break;
    case "off_topic":
      answer = answers.OFF_TOPIC_ANSWER;
      break;
    case "unsupported":
      answer = answers.unsupportedAnswer(intent.what);
      break;
    case "missing_reference":
      answer = answers.MISSING_REFERENCE_ANSWERS[intent.action];
      break;
    case "search": {
      const result = yield* call("search_products", intent.input);
      answer = result.ok
        ? answers.searchAnswer(intent.input, (result.data as { results: never[] }).results)
        : result.error;
      break;
    }
    case "details": {
      const result = yield* call("get_product_details", { product_id: intent.productId });
      answer = result.ok ? answers.detailsAnswer(result.data as answers.ProductDetails) : result.error;
      break;
    }
    case "compare_search": {
      // "Compare the two best OLED TVs": search first, then compare the top results.
      const search = yield* call("search_products", intent.input);
      const ids = search.ok ? (search.data as { results: { id: string }[] }).results.map((r) => r.id) : [];
      if (ids.length < 2) {
        answer = answers.searchAnswer(intent.input, search.ok ? (search.data as { results: never[] }).results : []);
        break;
      }
      const result = yield* call("compare_products", { product_ids: ids.slice(0, 2) });
      answer = result.ok ? answers.compareAnswer(result.data as answers.Comparison) : result.error;
      break;
    }
    case "compare": {
      const result = yield* call("compare_products", { product_ids: intent.productIds });
      answer = result.ok ? answers.compareAnswer(result.data as answers.Comparison) : result.error;
      break;
    }
    case "add_to_cart": {
      const result = yield* call("add_to_cart", { product_id: intent.productId, quantity: intent.quantity });
      answer = result.ok ? answers.cartAnswer(result.data as never) : `Sorry, I couldn't add it: ${result.error}`;
      break;
    }
  }

  // Stream word by word so the UI behaves like it does with a real model.
  for (const chunk of answer.split(/(?<=\s)/)) {
    if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
    yield { type: "text", delta: chunk };
  }
}
