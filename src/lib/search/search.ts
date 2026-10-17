import { PRODUCTS, type Category, type Product, type SpecValue } from "@/lib/catalog";
import { Bm25Index } from "./bm25";
import { cosine, WordVectorEmbedder, type Embedder } from "./embeddings";
import { productSemanticText, productText, tokenize } from "./text";

export interface SpecFilter {
  key: string; // e.g. "ram_gb"
  min?: number;
  max?: number;
  equals?: SpecValue;
}

export interface SearchFilters {
  category?: Category;
  brand?: string;
  minPrice?: number;
  maxPrice?: number;
  minRating?: number;
  inStockOnly?: boolean;
  /** Every tag must be present, e.g. ["gaming"]. */
  tags?: string[];
  specs?: SpecFilter[];
}

export type SortOrder = "relevance" | "price_asc" | "price_desc" | "rating";
export type SearchMode = "hybrid" | "keyword" | "semantic";

export interface SearchOptions {
  query?: string;
  filters?: SearchFilters;
  sort?: SortOrder;
  limit?: number;
  /** Lets the eval compare hybrid search against each half. */
  mode?: SearchMode;
}

export interface SearchHit {
  product: Product;
  score: number;
}

/** Below this (centered) cosine similarity, a product is not considered related. */
const MIN_SIMILARITY = 0.2;
/** Only the closest products count as semantic matches. */
const MAX_SEMANTIC_HITS = 20;
/** Standard constant for Reciprocal Rank Fusion; dampens the weight of top ranks. */
const RRF_K = 60;

export function matchesFilters(p: Product, f: SearchFilters = {}): boolean {
  if (f.category && p.category !== f.category) return false;
  if (f.brand && p.brand.toLowerCase() !== f.brand.toLowerCase()) return false;
  if (f.minPrice !== undefined && p.price < f.minPrice) return false;
  if (f.maxPrice !== undefined && p.price > f.maxPrice) return false;
  if (f.minRating !== undefined && p.rating < f.minRating) return false;
  if (f.inStockOnly && p.stock === 0) return false;
  if (f.tags?.some((t) => !p.tags.includes(t.toLowerCase()))) return false;
  for (const s of f.specs ?? []) {
    const value = p.specs[s.key];
    if (value === undefined) return false;
    if (s.equals !== undefined && String(value).toLowerCase() !== String(s.equals).toLowerCase()) return false;
    if (s.min !== undefined && !(typeof value === "number" && value >= s.min)) return false;
    if (s.max !== undefined && !(typeof value === "number" && value <= s.max)) return false;
  }
  return true;
}

/**
 * Reciprocal Rank Fusion: each list contributes 1 / (k + rank) for every item.
 * It only uses ranks, so we don't have to calibrate BM25 scores against cosine
 * similarities, which live on completely different scales.
 */
export function reciprocalRankFusion(rankings: string[][], k = RRF_K): Map<string, number> {
  const fused = new Map<string, number>();
  for (const ranking of rankings) {
    ranking.forEach((id, rank) => fused.set(id, (fused.get(id) ?? 0) + 1 / (k + rank + 1)));
  }
  return fused;
}

const rankByScore = (scores: Map<string, number>) =>
  [...scores.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);

export class ProductSearch {
  private readonly bm25: Bm25Index;
  private readonly productVectors = new Map<string, Float32Array>();
  private readonly byId: Map<string, Product>;
  private readonly meanVector: Float32Array;

  constructor(
    private readonly products: Product[],
    private readonly embedder: Embedder,
  ) {
    const docs = products.map((p) => tokenize(productText(p)));
    this.bm25 = new Bm25Index(
      products.map((p) => p.id),
      docs,
    );
    this.byId = new Map(products.map((p) => [p.id, p]));
    // 200 products x ~30 words: computing every vector at startup takes a few ms.
    const raw = new Map<string, Float32Array>();
    for (const p of products) {
      const v = embedder.embed(tokenize(productSemanticText(p)));
      if (v) raw.set(p.id, v);
    }
    // Averaged word vectors all share a big common direction (frequent words),
    // which squeezes every cosine into a narrow band. Subtracting the mean
    // vector ("common component removal", from the SIF paper) spreads them out.
    this.meanVector = mean([...raw.values()]);
    for (const [id, v] of raw) this.productVectors.set(id, center(v, this.meanVector));
  }

  search({ query = "", filters, sort = "relevance", limit = 5, mode = "hybrid" }: SearchOptions): SearchHit[] {
    // 1. Hard filters first: a product over budget must never show up, however relevant.
    const candidates = new Set(this.products.filter((p) => matchesFilters(p, filters)).map((p) => p.id));
    const tokens = tokenize(query);

    let scored: Map<string, number>;
    if (tokens.length === 0) {
      // No text query (e.g. "laptops under 800€"): every candidate is relevant; sort by rating.
      scored = new Map([...candidates].map((id) => [id, this.byId.get(id)!.rating]));
    } else {
      // 2. Two independent rankings restricted to the candidates...
      const keyword = rankByScore(filterKeys(this.bm25.search(tokens), candidates));
      const semantic = rankByScore(filterKeys(this.semanticScores(tokens), candidates)).slice(0, MAX_SEMANTIC_HITS);
      // 3. ...fused with RRF.
      const rankings = mode === "keyword" ? [keyword] : mode === "semantic" ? [semantic] : [keyword, semantic];
      scored = reciprocalRankFusion(rankings);
    }

    const hits = [...scored.entries()].map(([id, score]) => ({ product: this.byId.get(id)!, score }));
    hits.sort((a, b) => {
      if (sort === "price_asc") return a.product.price - b.product.price;
      if (sort === "price_desc") return b.product.price - a.product.price;
      if (sort === "rating") return b.product.rating - a.product.rating;
      return b.score - a.score;
    });
    return hits.slice(0, limit);
  }

  private semanticScores(tokens: string[]): Map<string, number> {
    const scores = new Map<string, number>();
    const raw = this.embedder.embed(tokens);
    if (!raw) return scores;
    const q = center(raw, this.meanVector);
    for (const [id, v] of this.productVectors) {
      const sim = cosine(q, v);
      if (sim >= MIN_SIMILARITY) scores.set(id, sim);
    }
    return scores;
  }
}

function mean(vectors: Float32Array[]): Float32Array {
  const m = new Float32Array(vectors[0]?.length ?? 0);
  for (const v of vectors) for (let i = 0; i < m.length; i++) m[i] += v[i] / vectors.length;
  return m;
}

/** v - mean, re-normalized to unit length. */
function center(v: Float32Array, m: Float32Array): Float32Array {
  const out = v.map((x, i) => x - m[i]);
  const norm = Math.hypot(...out) || 1;
  return out.map((x) => x / norm);
}

function filterKeys(scores: Map<string, number>, keep: Set<string>): Map<string, number> {
  return new Map([...scores].filter(([id]) => keep.has(id)));
}

let defaultSearch: ProductSearch | undefined;

/** Lazily built singleton over the full catalog, shared by tools, agent and eval. */
export function getProductSearch(): ProductSearch {
  if (!defaultSearch) {
    // IDF weights from the catalog: words that appear in every product ("gb") weigh little.
    const docs = PRODUCTS.map((p) => new Set(tokenize(productText(p))));
    const df = new Map<string, number>();
    for (const d of docs) for (const t of d) df.set(t, (df.get(t) ?? 0) + 1);
    const idf = (w: string) => Math.log((docs.length + 1) / ((df.get(w) ?? 0) + 1)) + 1;
    defaultSearch = new ProductSearch(PRODUCTS, WordVectorEmbedder.fromDataDir(idf));
  }
  return defaultSearch;
}
