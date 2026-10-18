import { describe, expect, it } from "vitest";
import { PRODUCTS } from "@/lib/catalog";
import { Bm25Index } from "./bm25";
import { cosine, WordVectorEmbedder } from "./embeddings";
import { getProductSearch, matchesFilters, reciprocalRankFusion } from "./search";
import { tokenize } from "./text";

describe("tokenize", () => {
  it("lowercases, strips accents and stopwords, keeps decimals", () => {
    expect(tokenize('Un écran OLED for the 6.7" phone!')).toEqual(["un", "ecran", "oled", "6.7", "phone"]);
  });
});

describe("Bm25Index", () => {
  const index = new Bm25Index(
    ["a", "b", "c"],
    [
      ["red", "phone"],
      ["blue", "phone"],
      ["red", "red", "laptop"],
    ],
  );

  it("only returns documents that contain a query term", () => {
    expect([...index.search(["laptop"]).keys()]).toEqual(["c"]);
  });

  it("ranks rare terms higher than common ones", () => {
    expect(index.idf("laptop")).toBeGreaterThan(index.idf("phone"));
  });
});

describe("reciprocalRankFusion", () => {
  it("rewards items ranked well in both lists", () => {
    const fused = reciprocalRankFusion([
      ["x", "y", "z"],
      ["y", "z", "x"],
    ]);
    const order = [...fused.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
    expect(order[0]).toBe("y");
  });
});

describe("WordVectorEmbedder", () => {
  const embedder = WordVectorEmbedder.fromDataDir();

  it("puts related words closer than unrelated ones", () => {
    const quiet = embedder.embed(["quiet"])!;
    expect(cosine(quiet, embedder.embed(["noise"])!)).toBeGreaterThan(cosine(quiet, embedder.embed(["camera"])!));
  });

  it("returns null when no word is known", () => {
    expect(embedder.embed(["zzqx"])).toBeNull();
  });
});

describe("matchesFilters", () => {
  const p = PRODUCTS.find((x) => x.category === "laptop")!;

  it("applies price, category and spec filters", () => {
    expect(matchesFilters(p, { category: "laptop", maxPrice: p.price })).toBe(true);
    expect(matchesFilters(p, { maxPrice: p.price - 1 })).toBe(false);
    expect(matchesFilters(p, { category: "tv" })).toBe(false);
    expect(matchesFilters(p, { specs: [{ key: "ram_gb", min: Number(p.specs.ram_gb) }] })).toBe(true);
    expect(matchesFilters(p, { specs: [{ key: "ram_gb", min: Number(p.specs.ram_gb) + 1 }] })).toBe(false);
    expect(matchesFilters(p, { specs: [{ key: "does_not_exist", equals: true }] })).toBe(false);
  });
});

describe("ProductSearch", () => {
  const search = getProductSearch();

  it("never returns products that break a hard filter", () => {
    const hits = search.search({ query: "laptop", filters: { maxPrice: 900, category: "laptop" }, limit: 50 });
    expect(hits.length).toBeGreaterThan(0);
    for (const h of hits) {
      expect(h.product.category).toBe("laptop");
      expect(h.product.price).toBeLessThanOrEqual(900);
    }
  });

  it("finds noise-cancelling headphones from a natural phrasing", () => {
    const hits = search.search({ query: "quiet headphones for the train" });
    expect(hits[0].product.category).toBe("headphones");
    expect(hits.every((h) => h.product.specs.noise_cancelling === true)).toBe(true);
  });

  it("semantic search understands words absent from the catalog", () => {
    // "jogging" appears in no product text, so keyword search finds nothing...
    expect(search.search({ query: "jogging", mode: "keyword" })).toHaveLength(0);
    // ...but its vector is close to "running", "sport", "fitness".
    const hits = search.search({ query: "jogging", mode: "semantic" });
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].product.category).toBe("smartwatch");
  });

  it("semantic search maps intent to a category (binge watching -> TV)", () => {
    // No TV mentions "binge" or "series": keyword search returns other products.
    const hits = search.search({ query: "binge watching series", mode: "semantic" });
    expect(hits[0].product.category).toBe("tv");
  });

  it("sorts by price when asked", () => {
    const hits = search.search({ filters: { category: "tv" }, sort: "price_asc", limit: 3 });
    const tvPrices = PRODUCTS.filter((p) => p.category === "tv").map((p) => p.price);
    expect(hits[0].product.price).toBe(Math.min(...tvPrices));
    expect(hits[1].product.price).toBeGreaterThanOrEqual(hits[0].product.price);
  });

  it("returns nothing when no product matches", () => {
    expect(search.search({ filters: { category: "tv", maxPrice: 10 } })).toHaveLength(0);
  });
});
