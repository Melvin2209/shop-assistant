import { describe, expect, it } from "vitest";
import { addToCart, applyEvent, cartTotal, productsFromToolCalls, splitNdjson, type UiMessage } from "./state";

const empty: UiMessage = { id: "a", role: "assistant", text: "", toolCalls: [], pending: true };

describe("applyEvent", () => {
  it("builds a message from streamed events", () => {
    let m = applyEvent(empty, { type: "text", delta: "Hello " });
    m = applyEvent(m, { type: "tool_call", id: "t1", name: "search_products", input: { query: "tv" } });
    m = applyEvent(m, {
      type: "tool_result",
      id: "t1",
      name: "search_products",
      result: { ok: true, data: { results: [] } },
    });
    m = applyEvent(m, { type: "text", delta: "world" });
    m = applyEvent(m, { type: "done", mode: "mock" });
    expect(m.text).toBe("Hello world");
    expect(m.toolCalls[0].result).toEqual({ ok: true, data: { results: [] } });
    expect(m.pending).toBe(false);
  });
});

describe("splitNdjson", () => {
  it("keeps incomplete lines for the next chunk", () => {
    const { events, rest } = splitNdjson('{"type":"text","delta":"a"}\n{"type":"te');
    expect(events).toEqual([{ type: "text", delta: "a" }]);
    expect(rest).toBe('{"type":"te');
  });
});

describe("productsFromToolCalls", () => {
  it("finds products anywhere in successful tool results", () => {
    const product = {
      id: "P0001",
      name: "X",
      brand: "B",
      price: 10,
      rating: 4,
      reviewCount: 1,
      inStock: true,
      category: "tv",
    };
    const map = productsFromToolCalls([
      { id: "1", name: "search_products", input: {}, result: { ok: true, data: { results: [product] } } },
      { id: "2", name: "get_product_details", input: {}, result: { ok: false, error: "nope" } },
    ]);
    expect([...map.keys()]).toEqual(["P0001"]);
  });
});

describe("cart", () => {
  it("merges quantities and computes the total", () => {
    let cart = addToCart([], { productId: "P1", name: "A", unitPrice: 10.1, quantity: 1 });
    cart = addToCart(cart, { productId: "P1", name: "A", unitPrice: 10.1, quantity: 2 });
    cart = addToCart(cart, { productId: "P2", name: "B", unitPrice: 5, quantity: 1 });
    expect(cart).toHaveLength(2);
    expect(cart[0].quantity).toBe(3);
    expect(cartTotal(cart)).toBe(35.3);
  });
});
