import rawProducts from "../../../data/products.json";
import type { Product } from "./types";

export * from "./types";

/**
 * The whole catalog, loaded once from the generated JSON file.
 * JSON imports are typed loosely, hence the cast; catalog.test.ts checks the shape.
 */
export const PRODUCTS = rawProducts as unknown as Product[];

const byId = new Map(PRODUCTS.map((p) => [p.id, p]));

export function getProductById(id: string): Product | undefined {
  return byId.get(id.trim().toUpperCase());
}
