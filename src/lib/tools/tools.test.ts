import { describe, expect, it } from "vitest";
import { PRODUCTS } from "@/lib/catalog";
import { TOOL_DEFINITIONS } from "./definitions";
import { executeTool, TOOL_NAMES } from "./tools";

const inStock = PRODUCTS.find((p) => p.stock > 2)!;
const outOfStock = PRODUCTS.find((p) => p.stock === 0)!;
const laptops = PRODUCTS.filter((p) => p.category === "laptop");

// Small helper: run a tool and assert it succeeded.
function ok(name: string, input: unknown) {
  const result = executeTool(name, input);
  if (!result.ok) throw new Error(result.error);
  return result.data as Record<string, unknown>;
}

describe("executeTool", () => {
  it("rejects unknown tools and invalid arguments without throwing", () => {
    expect(executeTool("delete_database", {})).toEqual({ ok: false, error: "Unknown tool: delete_database" });
    const bad = executeTool("get_product_details", { product_id: "42" });
    expect(bad.ok).toBe(false);
    expect(!bad.ok && bad.error).toContain("product_id");
  });
});

describe("search_products", () => {
  it("applies filters and the limit", () => {
    const data = ok("search_products", { category: "laptop", max_price: 1000, limit: 3 });
    const results = data.results as { category: string; price: number }[];
    expect(results.length).toBeLessThanOrEqual(3);
    for (const r of results) {
      expect(r.category).toBe("laptop");
      expect(r.price).toBeLessThanOrEqual(1000);
    }
  });

  it("supports spec filters and price sorting", () => {
    const data = ok("search_products", {
      category: "laptop",
      specs: [{ key: "ram_gb", min: 32 }],
      sort: "price_asc",
      limit: 10,
    });
    const results = data.results as { price: number; specs: { ram_gb: number } }[];
    const expected = laptops.filter((p) => Number(p.specs.ram_gb) >= 32);
    expect(results.length).toBe(Math.min(10, expected.length));
    expect(results[0].price).toBe(Math.min(...expected.map((p) => p.price)));
    expect(results.every((r) => r.specs.ram_gb >= 32)).toBe(true);
  });

  it("returns an empty list rather than an error when nothing matches", () => {
    expect(ok("search_products", { category: "tv", max_price: 5 }).results).toEqual([]);
  });
});

describe("get_product_details", () => {
  it("returns reviews and stock for a known product", () => {
    const data = ok("get_product_details", { product_id: inStock.id.toLowerCase() });
    expect(data.id).toBe(inStock.id);
    expect(data.price).toBe(inStock.price);
    expect(data.reviews).toEqual(inStock.reviews);
    expect(data.stockLeft).toBe(inStock.stock);
  });

  it("explains how to recover from an unknown id", () => {
    const result = executeTool("get_product_details", { product_id: "P9999" });
    expect(result).toEqual({ ok: false, error: expect.stringContaining("search_products") });
  });
});

describe("compare_products", () => {
  it("builds a spec table and finds the cheapest and best rated", () => {
    const [a, b, c] = laptops;
    const data = ok("compare_products", { product_ids: [a.id, b.id, c.id] });
    const table = data.specTable as Record<string, unknown[]>;
    expect(table.ram_gb).toEqual([a.specs.ram_gb, b.specs.ram_gb, c.specs.ram_gb]);
    expect(data.cheapestId).toBe([a, b, c].sort((x, y) => x.price - y.price)[0].id);
    expect(data.sameCategory).toBe(true);
  });

  it("uses null for specs that do not apply across categories", () => {
    const tv = PRODUCTS.find((p) => p.category === "tv")!;
    const data = ok("compare_products", { product_ids: [laptops[0].id, tv.id] });
    expect((data.specTable as Record<string, unknown[]>).ram_gb[1]).toBeNull();
    expect(data.sameCategory).toBe(false);
  });

  it("requires 2 to 3 distinct products", () => {
    expect(executeTool("compare_products", { product_ids: [laptops[0].id] }).ok).toBe(false);
    expect(executeTool("compare_products", { product_ids: laptops.slice(0, 4).map((p) => p.id) }).ok).toBe(false);
    expect(executeTool("compare_products", { product_ids: [laptops[0].id, laptops[0].id] }).ok).toBe(false);
  });
});

describe("add_to_cart", () => {
  it("returns a cart line with the catalog price", () => {
    expect(ok("add_to_cart", { product_id: inStock.id, quantity: 2 })).toEqual({
      productId: inStock.id,
      name: inStock.name,
      unitPrice: inStock.price,
      quantity: 2,
    });
  });

  it("refuses out-of-stock products and excessive quantities", () => {
    expect(executeTool("add_to_cart", { product_id: outOfStock.id }).ok).toBe(false);
    expect(executeTool("add_to_cart", { product_id: inStock.id, quantity: 6 }).ok).toBe(false);
  });
});

describe("TOOL_DEFINITIONS", () => {
  it("exposes one JSON schema per tool, generated from zod", () => {
    expect(TOOL_DEFINITIONS.map((t) => t.name)).toEqual(TOOL_NAMES);
    const search = TOOL_DEFINITIONS.find((t) => t.name === "search_products")!;
    expect(search.input_schema.type).toBe("object");
    expect(search.input_schema).not.toHaveProperty("$schema");
    expect(search.description).toContain("ram_gb");
  });
});
