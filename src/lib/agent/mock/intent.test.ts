import { describe, expect, it } from "vitest";
import type { ChatMessage } from "../types";
import { detectIntent, extractSearchInput } from "./intent";

const ask = (content: string, previousAnswer?: string): ChatMessage[] => [
  ...(previousAnswer ? [{ role: "user" as const, content: "..." }, { role: "assistant" as const, content: previousAnswer }] : []),
  { role: "user", content },
];

const PREVIOUS = "- A [P0010]\n- B [P0020]\n- C [P0030]\n\nMy pick: **B** [P0020]";

describe("extractSearchInput", () => {
  it("extracts category, budget, specs and sort order", () => {
    expect(extractSearchInput("cheapest laptop under €1,200 with 16gb ram and 1tb ssd")).toMatchObject({
      category: "laptop",
      max_price: 1200,
      sort: "price_asc",
      specs: [
        { key: "ram_gb", min: 16 },
        { key: "storage_gb", min: 1024 },
      ],
    });
  });

  it("understands price ranges and boolean features", () => {
    expect(extractSearchInput("noise cancelling headphones between 100 and 250 euros")).toMatchObject({
      category: "headphones",
      min_price: 100,
      max_price: 250,
      specs: [{ key: "noise_cancelling", equals: true }],
    });
  });
});

describe("detectIntent", () => {
  it("routes shopping requests to a search", () => {
    expect(detectIntent(ask("I need a TV for movies")).kind).toBe("search");
    expect(detectIntent(ask("something for jogging")).kind).toBe("search");
  });

  it("refuses off-topic questions and unsupported products", () => {
    expect(detectIntent(ask("What is the capital of France?")).kind).toBe("off_topic");
    expect(detectIntent(ask("Write me a poem about cats")).kind).toBe("off_topic");
    expect(detectIntent(ask("Do you sell washing machines?"))).toEqual({ kind: "unsupported", what: "washing machines" });
  });

  it("resolves references to the previous answer", () => {
    expect(detectIntent(ask("compare the first two", PREVIOUS))).toEqual({ kind: "compare", productIds: ["P0010", "P0020"] });
    expect(detectIntent(ask("compare them", PREVIOUS))).toEqual({ kind: "compare", productIds: ["P0010", "P0020", "P0030"] });
    expect(detectIntent(ask("tell me more about the third one", PREVIOUS))).toEqual({ kind: "details", productId: "P0030" });
    // "it" = the recommendation, cited last.
    expect(detectIntent(ask("add it to my cart", PREVIOUS))).toEqual({ kind: "add_to_cart", productId: "P0020", quantity: 1 });
  });

  it("uses explicit ids and quantities", () => {
    expect(detectIntent(ask("add 2 units of P0042 to my cart"))).toEqual({ kind: "add_to_cart", productId: "P0042", quantity: 2 });
    expect(detectIntent(ask("P0007"))).toEqual({ kind: "details", productId: "P0007" });
  });

  it("asks for clarification when a reference cannot be resolved", () => {
    expect(detectIntent(ask("add it to my cart"))).toEqual({ kind: "missing_reference", action: "add_to_cart" });
  });
});
