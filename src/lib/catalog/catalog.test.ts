import { describe, expect, it } from "vitest";
import { generateCatalog } from "./generator";
import { CATEGORIES, PRODUCTS, getProductById } from "./index";

describe("catalog generator", () => {
  it("is deterministic for a given seed", () => {
    expect(generateCatalog(7)).toEqual(generateCatalog(7));
    expect(generateCatalog(7)).not.toEqual(generateCatalog(8));
  });

  it("matches the committed data/products.json (run `npm run catalog:generate` if this fails)", () => {
    expect(PRODUCTS).toEqual(generateCatalog());
  });
});

describe("catalog data", () => {
  it("has about 200 products, 25 per category", () => {
    expect(PRODUCTS).toHaveLength(200);
    for (const category of CATEGORIES) {
      expect(PRODUCTS.filter((p) => p.category === category)).toHaveLength(25);
    }
  });

  it("has unique ids and names", () => {
    expect(new Set(PRODUCTS.map((p) => p.id)).size).toBe(PRODUCTS.length);
    expect(new Set(PRODUCTS.map((p) => p.name)).size).toBe(PRODUCTS.length);
  });

  it("has sane prices, ratings, stock and reviews", () => {
    for (const p of PRODUCTS) {
      expect(p.price).toBeGreaterThan(0);
      expect(p.rating).toBeGreaterThanOrEqual(1);
      expect(p.rating).toBeLessThanOrEqual(5);
      expect(p.stock).toBeGreaterThanOrEqual(0);
      expect(p.reviews.length).toBeGreaterThanOrEqual(2);
      expect(Object.keys(p.specs).length).toBeGreaterThan(3);
    }
  });

  it("has some out-of-stock products to exercise the cart guardrail", () => {
    expect(PRODUCTS.some((p) => p.stock === 0)).toBe(true);
  });
});

describe("getProductById", () => {
  it("finds a product, tolerating case and whitespace", () => {
    expect(getProductById(" p0001 ")?.id).toBe("P0001");
  });

  it("returns undefined for unknown ids", () => {
    expect(getProductById("P9999")).toBeUndefined();
  });
});
