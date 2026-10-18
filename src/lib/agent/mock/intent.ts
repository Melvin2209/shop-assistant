import { CATEGORIES, PRODUCTS, type Category } from "@/lib/catalog";
import type { SearchProductsInput } from "@/lib/tools/schemas";
import type { ChatMessage } from "../types";

/**
 * Rule-based intent detection for the mock agent. It plays the role the LLM
 * plays in real mode (choosing a tool and its arguments) with regexes, so the
 * demo works without any API key. It is intentionally simple and English-only.
 */
export type Intent =
  | { kind: "greeting" }
  | { kind: "off_topic" }
  | { kind: "unsupported"; what: string }
  | { kind: "search"; input: SearchProductsInput }
  | { kind: "details"; productId: string }
  | { kind: "compare"; productIds: string[] }
  | { kind: "compare_search"; input: SearchProductsInput }
  | { kind: "add_to_cart"; productId: string; quantity: number }
  | { kind: "missing_reference"; action: "details" | "compare" | "add_to_cart" };

const CATEGORY_WORDS: Record<Category, RegExp> = {
  laptop: /\b(laptops?|notebooks?|computers?|pcs?|macbooks?|ultrabooks?)\b/,
  smartphone: /\b(smart ?phones?|phones?|mobiles?|cell ?phones?)\b/,
  headphones: /\b(head ?phones?|headsets?|earbuds?|earphones?|buds)\b/,
  tv: /\b(tvs?|televisions?|tellys?)\b/,
  tablet: /\b(tablets?|ipads?)\b/,
  smartwatch: /\b(smart ?watch(es)?|watch(es)?|fitness trackers?)\b/,
  camera: /\b(cameras?|vlog\w*)\b/,
  speaker: /\b(speakers?|soundbars?|sound ?systems?)\b/,
};

/** Electronics a shopper may ask for but that this store does not sell. */
const UNSUPPORTED =
  /\b(washing machines?|fridges?|refrigerators?|printers?|drones?|consoles?|playstation|xbox|vacuums?|microwaves?|ovens?|coffee machines?|monitors?|keyboards?|mice|mouse|routers?|e-?readers?|projectors?)\b/;

const SHOPPING_WORDS =
  /\b(buy|recommend|looking for|need|want|cheap|cheapest|best|budget|gift|present|suggest|find|show me|options?|deals?|price|under|below|good for|something (for|to|that)|do you (have|sell))\b/;

const GREETING = /^(hi|hello|hey|good (morning|afternoon|evening)|bonjour|salut)\b[\s!.,]*$/;

/** "add it to my cart", "I'll take the second one", "buy P0042" */
const CART = /\b(add|put)\b|\b(cart|basket)\b|\bi'?ll take\b|\b(buy|order|purchase) (it|this|that|the (first|second|third|last)|p\d{4})\b/;

const ORDINALS: [RegExp, number][] = [
  [/\b(first|1st)\b/, 0],
  [/\b(second|2nd)\b/, 1],
  [/\b(third|3rd)\b/, 2],
];

/** Product ids cited in a text, in order of appearance, without duplicates. */
export function citedIds(text: string): string[] {
  return [...new Set((text.match(/\bP\d{4}\b/gi) ?? []).map((id) => id.toUpperCase()))];
}

export function detectCategory(text: string): Category | undefined {
  return CATEGORIES.find((c) => CATEGORY_WORDS[c].test(text));
}

/** Turns "laptop under €800 with 16GB RAM" into search_products arguments. */
export function extractSearchInput(text: string, category = detectCategory(text)): SearchProductsInput {
  const input: SearchProductsInput = { query: text, category };
  const amount = "€?\\s?(\\d[\\d,]*(?:\\.\\d+)?)\\s?(?:€|eur(?:os?)?)?";

  const between = text.match(new RegExp(`between\\s+${amount}\\s+and\\s+${amount}`));
  const max = text.match(new RegExp(`(?:under|below|less than|max(?:imum)?|up to|at most|budget(?: of| is)?|no more than|<)\\s*${amount}`));
  const min = text.match(new RegExp(`(?:over|above|more than|at least|from|>)\\s*${amount}`));
  const num = (s: string) => Number(s.replace(/,/g, ""));
  if (between) {
    input.min_price = num(between[1]);
    input.max_price = num(between[2]);
  } else {
    if (max) input.max_price = num(max[1]);
    if (min && !/at least \d+\s?(gb|tb|h|hours|mp)/.test(text)) input.min_price = num(min[1]);
  }

  const specs: NonNullable<SearchProductsInput["specs"]> = [];
  const ram = text.match(/(\d+)\s?gb\s?(?:of\s)?ram/);
  if (ram) specs.push({ key: "ram_gb", min: Number(ram[1]) });
  const storage = text.match(/(\d+)\s?(gb|tb)\s?(?:of\s)?(?:storage|ssd|disk)/);
  if (storage) specs.push({ key: "storage_gb", min: Number(storage[1]) * (storage[2] === "tb" ? 1024 : 1) });
  const inches = text.match(/(\d+(?:\.\d+)?)\s?(?:-\s?)?(?:inch(?:es)?|")/);
  if (inches) specs.push({ key: "screen_inches", min: Number(inches[1]) - 0.5, max: Number(inches[1]) + 0.5 });
  if (/noise[- ]cancel+ing|\banc\b/.test(text)) specs.push({ key: "noise_cancelling", equals: true });
  const panel = text.match(/\b(oled|qled)\b/);
  if (panel) specs.push({ key: "panel", equals: panel[1].toUpperCase() });
  const resolution = text.match(/\b(4k|8k)\b/);
  if (resolution && category === "tv") specs.push({ key: "resolution", equals: resolution[1].toUpperCase() });
  if (/\bgps\b/.test(text)) specs.push({ key: "gps", equals: true });
  if (/\b(stylus|pen)\b/.test(text)) specs.push({ key: "stylus_support", equals: true });
  if (/\b5g\b/.test(text)) specs.push({ key: "has_5g", equals: true });
  if (/\becg\b/.test(text)) specs.push({ key: "ecg", equals: true });
  if (specs.length) input.specs = specs;

  if (/\b(cheapest|least expensive|lowest price|most affordable)\b/.test(text)) input.sort = "price_asc";
  else if (/\b(most expensive|priciest|high[- ]end|premium)\b/.test(text)) input.sort = "price_desc";
  // "best laptop" = best rated laptop.
  else if (/\b(best|top|highest)[- ]rated\b|\bbest\b/.test(text)) input.sort = "rating";
  if (/\b(in stock|available now)\b/.test(text)) input.in_stock_only = true;

  const brand = [...new Set(PRODUCTS.map((p) => p.brand))].find((b) => text.includes(b.toLowerCase()));
  if (brand) input.brand = brand;
  return input;
}

/** Resolves "it", "the second one", "them" against the ids cited in the previous answer. */
function referencedIds(text: string, previousAnswer: string): string[] {
  const previous = citedIds(previousAnswer);
  if (previous.length === 0) return [];
  const firstN = text.match(/\b(?:first|top) (two|2|three|3)\b/);
  if (firstN) return previous.slice(0, ["two", "2"].includes(firstN[1]) ? 2 : 3);
  for (const [pattern, index] of ORDINALS) if (pattern.test(text) && previous[index]) return [previous[index]];
  if (/\b(last one|last option)\b/.test(text)) return [previous[previous.length - 1]];
  if (/\b(them|these|those|both|all three|the two|the three)\b/.test(text)) return previous.slice(0, 3);
  if (/\b(it|this one|that one|your pick|your recommendation|recommended one)\b|\b(this|that)[?.!]*$/.test(text)) {
    // Search answers end with "My pick: ... [Pxxxx]": "it" means the recommendation.
    const pick = previousAnswer.match(/My pick:[^\n]*?\[(P\d{4})\]/);
    return [pick ? pick[1] : previous[0]];
  }
  return [];
}

export function detectIntent(history: ChatMessage[]): Intent {
  const last = history[history.length - 1]?.content ?? "";
  const text = last.toLowerCase();
  const previousAnswer = [...history].reverse().find((m) => m.role === "assistant")?.content ?? "";
  const explicitIds = citedIds(last);
  const ids = explicitIds.length ? explicitIds : referencedIds(text, previousAnswer);

  if (GREETING.test(text.trim())) return { kind: "greeting" };

  if (CART.test(text)) {
    if (!ids.length) return { kind: "missing_reference", action: "add_to_cart" };
    const qty = text.match(/\b(\d)\s?(?:x|units?|pieces?)\b/) ?? text.match(/\b(?:add|buy|order)\s+(\d)\b/);
    return { kind: "add_to_cart", productId: ids[0], quantity: qty ? Number(qty[1]) : 1 };
  }

  if (/\b(compare|comparison|vs\.?|versus|difference|differences)\b|which (one )?is better/.test(text)) {
    if (ids.length >= 2) return { kind: "compare", productIds: ids.slice(0, 3) };
    const category = detectCategory(text);
    if (category) return { kind: "compare_search", input: { ...extractSearchInput(text, category), limit: 2 } };
    return { kind: "missing_reference", action: "compare" };
  }

  if (explicitIds.length === 1 || /\b(tell me more|more (info|details)|details|reviews?|what do (people|customers) say|specs of|is it good)\b/.test(text)) {
    if (ids.length) return { kind: "details", productId: ids[0] };
    if (!detectCategory(text)) return { kind: "missing_reference", action: "details" };
  }

  const unsupported = text.match(UNSUPPORTED);
  if (unsupported && !detectCategory(text)) return { kind: "unsupported", what: unsupported[0] };

  if (detectCategory(text) || SHOPPING_WORDS.test(text)) {
    // "Something for running" has no category word but is clearly a shopping request.
    return { kind: "search", input: extractSearchInput(text) };
  }

  return { kind: "off_topic" };
}
