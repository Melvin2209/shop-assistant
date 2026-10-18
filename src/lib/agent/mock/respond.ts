import { CATEGORIES, type Category, type Review, type SpecValue } from "@/lib/catalog";
import { CATEGORY_LABELS, formatPrice, formatSpec, KEY_SPECS } from "@/lib/format";
import type { SearchProductsInput } from "@/lib/tools/schemas";
import type { CartLine, ProductSummary } from "@/lib/tools/tools";

/**
 * Answer templates for the mock agent. Every figure is read from a tool
 * result, never typed by hand, so mock answers are grounded by construction.
 */

const stars = (p: { rating: number; reviewCount: number }) => `★ ${p.rating} (${p.reviewCount} reviews)`;

function keySpecs(p: ProductSummary): string {
  return KEY_SPECS[p.category as Category]
    .filter((k) => p.specs[k] !== undefined)
    .map((k) => formatSpec(k, p.specs[k]))
    .join(", ");
}

const line = (p: ProductSummary) =>
  `- **${p.name}** [${p.id}]: ${formatPrice(p.price)}, ${stars(p)}. ${keySpecs(p)}.${p.inStock ? "" : " _Out of stock._"}`;

/** The user's budget, written as they typed it ("€200", not "€200.00"). */
const budget = (n: number) => `€${n}`;

/** Recap of the filters we applied, e.g. " (under €200, noise cancelling)". */
function describeConstraints(input: SearchProductsInput): string {
  const parts: string[] = [];
  if (input.min_price !== undefined && input.max_price !== undefined)
    parts.push(`between ${budget(input.min_price)} and ${budget(input.max_price)}`);
  else if (input.max_price !== undefined) parts.push(`under ${budget(input.max_price)}`);
  else if (input.min_price !== undefined) parts.push(`over ${budget(input.min_price)}`);
  for (const s of input.specs ?? []) {
    if (s.equals !== undefined) parts.push(formatSpec(s.key, s.equals));
    else if (s.key === "screen_inches" && s.min !== undefined) parts.push(`around ${s.min + 0.5}"`);
    else if (s.min !== undefined) parts.push(`at least ${formatSpec(s.key, s.min)}`);
  }
  if (input.brand) parts.push(`by ${input.brand}`);
  if (input.sort === "price_asc") parts.push("cheapest first");
  if (input.sort === "rating") parts.push("best rated first");
  return parts.length ? ` (${parts.join(", ")})` : "";
}

/** Picks the product to recommend: best rated among those in stock. */
function pick(results: ProductSummary[], input: SearchProductsInput): { product: ProductSummary; why: string } {
  const available = results.filter((r) => r.inStock);
  const pool = available.length ? available : results;
  if (input.sort === "price_asc") return { product: pool[0], why: "the cheapest option" };
  if (input.sort === "price_desc") return { product: pool[0], why: "the most premium option" };
  const best = pool.reduce((a, b) => (b.rating > a.rating ? b : a));
  return { product: best, why: "the best rated of the list" };
}

export function searchAnswer(input: SearchProductsInput, results: ProductSummary[]): string {
  const label = input.category ? CATEGORY_LABELS[input.category].many : "products";
  if (results.length === 0) {
    return `I couldn't find any ${label}${describeConstraints(input)} in our catalog. Try raising your budget or removing a constraint, and I'll search again.`;
  }
  const { product, why } = pick(results, input);
  return [
    `Here ${results.length === 1 ? "is 1 match" : `are ${results.length} ${label}`} for your request${describeConstraints(input)}:`,
    "",
    ...results.map(line),
    "",
    `My pick: **${product.name}** [${product.id}], ${why}. Want more details, a comparison, or should I add it to your cart?`,
  ].join("\n");
}

export interface ProductDetails extends ProductSummary {
  description: string;
  stockLeft: number;
  reviews: Review[];
}

export function detailsAnswer(p: ProductDetails): string {
  const specs = Object.entries(p.specs).map(([k, v]) => `- ${formatSpec(k, v)}`);
  const reviews = p.reviews.slice(0, 2).map((r) => `- ${r.author} (${r.rating}/5): "${r.body}"`);
  const stock = p.stockLeft > 0 ? `In stock (${p.stockLeft} left).` : "Currently out of stock.";
  return [
    `**${p.name}** [${p.id}] by ${p.brand}: ${formatPrice(p.price)}, ${stars(p)}. ${stock}`,
    "",
    p.description,
    "",
    "**Specs**",
    ...specs,
    "",
    "**What customers say**",
    ...reviews,
  ].join("\n");
}

export interface Comparison {
  products: ProductSummary[];
  specTable: Record<string, (SpecValue | null)[]>;
  cheapestId: string;
  bestRatedId: string;
  sameCategory: boolean;
}

export function compareAnswer(c: Comparison): string {
  const header = `| | ${c.products.map((p) => `${p.name} [${p.id}]`).join(" | ")} |`;
  const separator = `|---|${c.products.map(() => "---").join("|")}|`;
  const rows = [
    `| Price | ${c.products.map((p) => formatPrice(p.price)).join(" | ")} |`,
    `| Rating | ${c.products.map((p) => `★ ${p.rating}`).join(" | ")} |`,
    ...Object.entries(c.specTable).map(
      ([key, values]) => `| ${key.replace(/_/g, " ")} | ${values.map((v) => (v === null ? "n/a" : formatSpec(key, v))).join(" | ")} |`,
    ),
  ];
  const byId = (id: string) => c.products.find((p) => p.id === id)!;
  const cheapest = byId(c.cheapestId);
  const best = byId(c.bestRatedId);
  const verdict =
    cheapest.id === best.id
      ? `**${cheapest.name}** [${cheapest.id}] is both the cheapest and the best rated: an easy choice.`
      : `**${cheapest.name}** [${cheapest.id}] is the cheapest, **${best.name}** [${best.id}] is the best rated.`;
  return [
    c.sameCategory ? "Here is a side-by-side comparison:" : "These products are from different categories, but here is how they compare:",
    "",
    header,
    separator,
    ...rows,
    "",
    verdict,
  ].join("\n");
}

export function cartAnswer(l: CartLine): string {
  return `Done! I added ${l.quantity} × **${l.name}** [${l.productId}] (${formatPrice(l.unitPrice)} each) to your cart. Anything else I can help you find?`;
}

export const GREETING_ANSWER = `Hi! I'm the shopping assistant of Voltix. I can find products, compare them and add them to your cart. Try:
- "Noise-cancelling headphones for the train"
- "A light laptop for travel"
- "Compare the first two"`;

export const OFF_TOPIC_ANSWER =
  "Sorry, I can only help with shopping at Voltix: finding, comparing and buying electronics. Is there a product I can help you find?";

const CATALOG_LIST = CATEGORIES.map((c) => CATEGORY_LABELS[c].many).join(", ");

export const unsupportedAnswer = (what: string) =>
  `Sorry, we don't sell ${what} at Voltix. Our catalog covers ${CATALOG_LIST}. Can I help you with one of those?`;

export const MISSING_REFERENCE_ANSWERS = {
  details: "Which product would you like to know more about? Give me its id, or ask me to search first.",
  compare: "Which products should I compare? Search for a few first, then say \"compare the first two\" or give me 2-3 product ids.",
  add_to_cart: "Which product should I add to your cart? Search first, then say \"add the first one\" or give me a product id.",
};
