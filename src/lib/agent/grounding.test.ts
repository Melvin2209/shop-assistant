import { describe, expect, it } from "vitest";
import type { ToolCallRecord } from "@/lib/tools/tools";
import { checkGrounding } from "./grounding";

const searchCall: ToolCallRecord = {
  id: "t1",
  name: "search_products",
  input: { query: "laptop" },
  result: {
    ok: true,
    data: {
      results: [
        { id: "P0001", name: "Kestrel Forge 38", price: 929.99, specs: { ram_gb: 32, storage_gb: 1024, screen_inches: 16 } },
        { id: "P0002", name: "Lumio Aero 21", price: 1229.99, specs: { ram_gb: 16, storage_gb: 512, screen_inches: 14 } },
      ],
    },
  },
};

describe("checkGrounding", () => {
  it("accepts an answer that only uses tool data", () => {
    const answer =
      "The Kestrel Forge 38 [P0001] costs €929.99 with 32 GB of RAM, a 1 TB SSD and a 16-inch screen. " +
      "The Lumio Aero 21 [P0002] is €1,229.99 (16 GB).";
    const report = checkGrounding(answer, [searchCall]);
    expect(report).toEqual({
      grounded: true,
      citedIds: ["P0001", "P0002"],
      unknownIds: [],
      ungroundedPrices: [],
      ungroundedSpecs: [],
    });
  });

  it("flags invented prices, specs and product ids", () => {
    const answer = "The Kestrel Forge 38 [P0001] is only €899 with 64 GB RAM. Also see [P0150].";
    const report = checkGrounding(answer, [searchCall]);
    expect(report.grounded).toBe(false);
    expect(report.ungroundedPrices).toEqual([899]);
    expect(report.ungroundedSpecs).toEqual(["64 GB"]);
    expect(report.unknownIds).toEqual(["P0150"]);
  });

  it("allows simple derived amounts and the user's own numbers", () => {
    const answer =
      "Both fit your €1,500 budget. P0001 is €300 cheaper than P0002, about €930. Two units cost €1859.98.";
    expect(checkGrounding(answer, [searchCall], "laptop under €1500").grounded).toBe(true);
  });

  it("ignores failed tool calls as a source of truth", () => {
    const failed: ToolCallRecord = { id: "t2", name: "get_product_details", input: {}, result: { ok: false, error: "x" } };
    expect(checkGrounding("It costs €929.99", [failed]).ungroundedPrices).toEqual([929.99]);
  });

  it("treats an answer with no figures as grounded (e.g. a polite refusal)", () => {
    expect(checkGrounding("Sorry, I can only help with shopping in our store.", []).grounded).toBe(true);
  });
});
