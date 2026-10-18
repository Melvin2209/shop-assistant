import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { PRODUCTS } from "@/lib/catalog";
import type { ToolCallRecord } from "@/lib/tools/tools";
import { resolveMode, runAgentToCompletion } from "./index";
import { runRealAgent } from "./real";
import type { AgentEvent, ChatMessage } from "./types";

describe("resolveMode", () => {
  it("uses mock mode without an API key, real mode with one, unless forced", () => {
    expect(resolveMode({})).toBe("mock");
    expect(resolveMode({ ANTHROPIC_API_KEY: "sk-test" })).toBe("real");
    expect(resolveMode({ ANTHROPIC_API_KEY: "sk-test", ASSISTANT_MODE: "mock" })).toBe("mock");
  });
});

describe("mock agent", () => {
  it("runs a full grounded conversation: search, compare, add to cart", async () => {
    const history: ChatMessage[] = [];
    const say = async (content: string) => {
      history.push({ role: "user", content });
      const result = await runAgentToCompletion(history, { mode: "mock" });
      history.push({ role: "assistant", content: result.text });
      return result;
    };

    const search = await say("noise cancelling headphones under €200");
    expect(search.toolCalls[0].name).toBe("search_products");
    expect(search.grounding.grounded).toBe(true);
    expect(search.grounding.citedIds.length).toBeGreaterThan(0);
    for (const id of search.grounding.citedIds) {
      const p = PRODUCTS.find((x) => x.id === id)!;
      expect(p.price).toBeLessThanOrEqual(200);
      expect(p.specs.noise_cancelling).toBe(true);
      expect(search.text).toContain(p.name);
    }

    const compare = await say("compare the first two");
    expect(compare.toolCalls[0]).toMatchObject({ name: "compare_products", input: { product_ids: search.grounding.citedIds.slice(0, 2) } });
    expect(compare.grounding.grounded).toBe(true);

    const cart = await say("add the first one to my cart");
    expect(cart.toolCalls[0].name).toBe("add_to_cart");
    expect(cart.grounding.grounded).toBe(true);
  });

  it("politely refuses off-topic requests without calling tools", async () => {
    const result = await runAgentToCompletion([{ role: "user", content: "Who won the 1998 World Cup?" }], { mode: "mock" });
    expect(result.toolCalls).toHaveLength(0);
    expect(result.text).toMatch(/only help with shopping/);
  });
});

/**
 * A fake Anthropic client that replays scripted responses, so the real
 * tool-use loop can be tested without network or API key.
 */
function fakeClient(responses: Anthropic.Message[]) {
  const requests: Anthropic.MessageCreateParams[] = [];
  const client = {
    messages: {
      stream(params: Anthropic.MessageCreateParams) {
        requests.push(structuredClone(params));
        const message = responses.shift()!;
        const events = message.content
          .filter((b) => b.type === "text")
          .map((b) => ({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: b.text } }));
        return {
          async *[Symbol.asyncIterator]() {
            yield* events;
          },
          finalMessage: async () => message,
        };
      },
    },
  };
  return { client: client as unknown as Anthropic, requests };
}

const message = (content: unknown[], stop_reason: string): Anthropic.Message =>
  ({ id: "msg", type: "message", role: "assistant", model: "test", content, stop_reason, usage: {} }) as never;

describe("real agent loop", () => {
  it("runs requested tools, sends results back and streams the final answer", async () => {
    const tv = PRODUCTS.find((p) => p.category === "tv")!;
    const { client, requests } = fakeClient([
      message(
        [
          { type: "text", text: "Let me search. " },
          { type: "tool_use", id: "tu_1", name: "get_product_details", input: { product_id: tv.id } },
        ],
        "tool_use",
      ),
      message([{ type: "text", text: `It costs €${tv.price} [${tv.id}].` }], "end_turn"),
    ]);

    const toolCalls: ToolCallRecord[] = [];
    const events: AgentEvent[] = [];
    for await (const e of runRealAgent([{ role: "user", content: "price of that TV?" }], toolCalls, client)) events.push(e);

    expect(events.map((e) => e.type)).toEqual(["text", "tool_call", "tool_result", "text"]);
    expect(toolCalls[0].result.ok).toBe(true);
    // Second request = history + assistant tool_use + user tool_result, in that order.
    const second = requests[1].messages;
    expect(second.map((m) => m.role)).toEqual(["user", "assistant", "user"]);
    expect((second[2].content as Anthropic.ToolResultBlockParam[])[0]).toMatchObject({ tool_use_id: "tu_1", is_error: false });
    expect(requests[0].model).toBe("claude-haiku-5-5");
  });

  it("returns tool errors to the model instead of crashing", async () => {
    const { client, requests } = fakeClient([
      message([{ type: "tool_use", id: "tu_1", name: "add_to_cart", input: { product_id: "P9999" } }], "tool_use"),
      message([{ type: "text", text: "Sorry, I could not find that product." }], "end_turn"),
    ]);
    const toolCalls: ToolCallRecord[] = [];
    for await (const _ of runRealAgent([{ role: "user", content: "buy P9999" }], toolCalls, client)) void _;
    expect(toolCalls[0].result.ok).toBe(false);
    expect((requests[1].messages[2].content as Anthropic.ToolResultBlockParam[])[0].is_error).toBe(true);
  });

  it("stops after too many tool rounds", async () => {
    const loop = () => message([{ type: "tool_use", id: "x", name: "search_products", input: {} }], "tool_use");
    const { client } = fakeClient(Array.from({ length: 10 }, loop));
    const events: AgentEvent[] = [];
    for await (const e of runRealAgent([{ role: "user", content: "?" }], [], client)) events.push(e);
    expect(events.at(-1)).toMatchObject({ type: "error" });
  });
});
