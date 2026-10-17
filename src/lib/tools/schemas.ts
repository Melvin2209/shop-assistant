import { z } from "zod";
import { CATEGORIES } from "@/lib/catalog";

/**
 * Tool input schemas. They are the single source of truth: used to validate
 * what the model sends AND converted to JSON Schema for the API (definitions.ts).
 * Never trust model-generated arguments without validating them.
 */

const productId = z
  .string()
  .regex(/^P\d{4}$/i, "Product ids look like P0042")
  .describe('Product id from a previous tool result, e.g. "P0042"');

export const searchProductsInput = z.object({
  query: z
    .string()
    .optional()
    .describe("Free-text description of what the customer wants, e.g. 'quiet headphones for the train'"),
  category: z.enum(CATEGORIES).optional(),
  brand: z.string().optional(),
  min_price: z.number().nonnegative().optional().describe("In EUR"),
  max_price: z.number().positive().optional().describe("In EUR"),
  min_rating: z.number().min(1).max(5).optional(),
  in_stock_only: z.boolean().optional(),
  tags: z.array(z.string()).optional().describe("All must match, e.g. ['gaming']"),
  specs: z
    .array(
      z.object({
        key: z.string().describe("Spec key, e.g. 'ram_gb'"),
        min: z.number().optional(),
        max: z.number().optional(),
        equals: z.union([z.string(), z.number(), z.boolean()]).optional(),
      }),
    )
    .optional()
    .describe("Spec constraints, e.g. [{key:'ram_gb', min:16}] or [{key:'noise_cancelling', equals:true}]"),
  sort: z.enum(["relevance", "price_asc", "price_desc", "rating"]).optional(),
  limit: z.number().int().min(1).max(10).optional().describe("Max results, default 5"),
});

export const getProductDetailsInput = z.object({ product_id: productId });

export const compareProductsInput = z.object({
  product_ids: z.array(productId).min(2).max(3).describe("2 or 3 product ids"),
});

export const addToCartInput = z.object({
  product_id: productId,
  quantity: z.number().int().min(1).max(5).optional().describe("Default 1, max 5"),
});

export type SearchProductsInput = z.infer<typeof searchProductsInput>;
export type GetProductDetailsInput = z.infer<typeof getProductDetailsInput>;
export type CompareProductsInput = z.infer<typeof compareProductsInput>;
export type AddToCartInput = z.infer<typeof addToCartInput>;
