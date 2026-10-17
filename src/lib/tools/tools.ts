import type { z } from "zod";
import { getProductById, type Product, type SpecValue } from "@/lib/catalog";
import { getProductSearch } from "@/lib/search/search";
import {
  addToCartInput,
  compareProductsInput,
  getProductDetailsInput,
  searchProductsInput,
  type AddToCartInput,
  type CompareProductsInput,
  type GetProductDetailsInput,
  type SearchProductsInput,
} from "./schemas";

/** What a product looks like in search and comparison results (no reviews, to save tokens). */
export interface ProductSummary {
  id: string;
  name: string;
  brand: string;
  category: string;
  price: number;
  rating: number;
  reviewCount: number;
  inStock: boolean;
  tags: string[];
  specs: Record<string, SpecValue>;
}

export interface CartLine {
  productId: string;
  name: string;
  unitPrice: number;
  quantity: number;
}

/** Tools never throw: errors are returned so the model can recover (e.g. ask again). */
export type ToolResult<T = unknown> = { ok: true; data: T } | { ok: false; error: string };

export type ToolName = "search_products" | "get_product_details" | "compare_products" | "add_to_cart";

/** A tool call as recorded in the conversation (shown in the UI, used by the grounding check). */
export interface ToolCallRecord {
  id: string;
  name: ToolName;
  input: unknown;
  result: ToolResult;
}

export function summarize(p: Product): ProductSummary {
  return {
    id: p.id,
    name: p.name,
    brand: p.brand,
    category: p.category,
    price: p.price,
    rating: p.rating,
    reviewCount: p.reviewCount,
    inStock: p.stock > 0,
    tags: p.tags,
    specs: p.specs,
  };
}

const unknownProduct = (id: string): ToolResult<never> => ({
  ok: false,
  error: `No product with id ${id}. Use search_products to find valid ids.`,
});

export function searchProducts(input: SearchProductsInput) {
  const hits = getProductSearch().search({
    query: input.query,
    filters: {
      category: input.category,
      brand: input.brand,
      minPrice: input.min_price,
      maxPrice: input.max_price,
      minRating: input.min_rating,
      inStockOnly: input.in_stock_only,
      tags: input.tags,
      specs: input.specs,
    },
    sort: input.sort,
    limit: input.limit ?? 5,
  });
  return { ok: true as const, data: { results: hits.map((h) => summarize(h.product)) } };
}

export function getProductDetails({ product_id }: GetProductDetailsInput) {
  const p = getProductById(product_id);
  if (!p) return unknownProduct(product_id);
  const { stock, ...rest } = p;
  return { ok: true as const, data: { ...rest, inStock: stock > 0, stockLeft: stock } };
}

export function compareProducts({ product_ids }: CompareProductsInput) {
  const ids = [...new Set(product_ids.map((id) => id.toUpperCase()))];
  if (ids.length < 2) return { ok: false as const, error: "Give 2 or 3 different product ids to compare." };
  const products: Product[] = [];
  for (const id of ids) {
    const p = getProductById(id);
    if (!p) return unknownProduct(id);
    products.push(p);
  }

  // One row per spec key present in at least one product; missing values are null
  // so the model sees explicitly that a spec does not apply.
  const keys = [...new Set(products.flatMap((p) => Object.keys(p.specs)))];
  const specTable = Object.fromEntries(keys.map((k) => [k, products.map((p) => p.specs[k] ?? null)]));
  const cheapest = products.reduce((a, b) => (b.price < a.price ? b : a));
  const bestRated = products.reduce((a, b) => (b.rating > a.rating ? b : a));

  return {
    ok: true as const,
    data: {
      products: products.map(summarize),
      specTable,
      cheapestId: cheapest.id,
      bestRatedId: bestRated.id,
      sameCategory: new Set(products.map((p) => p.category)).size === 1,
    },
  };
}

export function addToCart({ product_id, quantity = 1 }: AddToCartInput): ToolResult<CartLine> {
  const p = getProductById(product_id);
  if (!p) return unknownProduct(product_id);
  if (p.stock === 0) return { ok: false, error: `${p.name} (${p.id}) is out of stock and cannot be added.` };
  if (quantity > p.stock) return { ok: false, error: `Only ${p.stock} unit(s) of ${p.name} left in stock.` };
  return { ok: true, data: { productId: p.id, name: p.name, unitPrice: p.price, quantity } };
}

const registry: Record<ToolName, { schema: z.ZodType; run: (input: never) => ToolResult }> = {
  search_products: { schema: searchProductsInput, run: searchProducts },
  get_product_details: { schema: getProductDetailsInput, run: getProductDetails },
  compare_products: { schema: compareProductsInput, run: compareProducts },
  add_to_cart: { schema: addToCartInput, run: addToCart },
};

export const TOOL_NAMES = Object.keys(registry) as ToolName[];

/** Validates raw (model-generated) input, then runs the tool. Never throws. */
export function executeTool(name: string, rawInput: unknown): ToolResult {
  const tool = registry[name as ToolName];
  if (!tool) return { ok: false, error: `Unknown tool: ${name}` };
  const parsed = tool.schema.safeParse(rawInput);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; ");
    return { ok: false, error: `Invalid arguments for ${name}: ${issues}` };
  }
  return tool.run(parsed.data as never);
}
