import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { CATEGORIES, PRODUCTS } from "@/lib/catalog";
import { addToCartInput, compareProductsInput, getProductDetailsInput, searchProductsInput } from "./schemas";
import type { ToolName } from "./tools";

/** Spec keys and tags available per category, so the model can build valid filters. */
function catalogVocabulary(): string {
  return CATEGORIES.map((c) => {
    const products = PRODUCTS.filter((p) => p.category === c);
    const keys = [...new Set(products.flatMap((p) => Object.keys(p.specs)))];
    const tags = [...new Set(products.flatMap((p) => p.tags))];
    return `- ${c}: specs [${keys.join(", ")}]; tags [${tags.join(", ")}]`;
  }).join("\n");
}

function inputSchema(schema: z.ZodType): Anthropic.Tool.InputSchema {
  const json = z.toJSONSchema(schema, { io: "input" }) as Record<string, unknown>;
  delete json.$schema; // the API only needs the object schema itself
  return json as Anthropic.Tool.InputSchema;
}

const DESCRIPTIONS: Record<ToolName, string> = {
  search_products: `Search the store catalog. Combine a free-text query (hybrid keyword + semantic search) with hard filters. Returns up to 'limit' products with price, rating, stock and specs. Prices are in EUR.
Available categories, spec keys and tags:
${catalogVocabulary()}`,
  get_product_details: "Get every detail of one product: full specs, description, stock and customer reviews.",
  compare_products:
    "Compare 2 or 3 products side by side. Returns their summaries, a spec table (null = spec does not apply), the cheapest and the best rated.",
  add_to_cart:
    "Add a product to the customer's cart. Only call it when the customer explicitly asks to add/buy a specific product. Fails if out of stock.",
};

export const TOOL_DEFINITIONS: Anthropic.Tool[] = [
  { name: "search_products", description: DESCRIPTIONS.search_products, input_schema: inputSchema(searchProductsInput) },
  {
    name: "get_product_details",
    description: DESCRIPTIONS.get_product_details,
    input_schema: inputSchema(getProductDetailsInput),
  },
  { name: "compare_products", description: DESCRIPTIONS.compare_products, input_schema: inputSchema(compareProductsInput) },
  { name: "add_to_cart", description: DESCRIPTIONS.add_to_cart, input_schema: inputSchema(addToCartInput) },
];
