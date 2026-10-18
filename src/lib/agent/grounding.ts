import type { ToolCallRecord } from "@/lib/tools/tools";

/**
 * Deterministic grounding check: every product id, price and spec figure in the
 * assistant's answer must come from a tool result of the same turn (or from the
 * user's own message, e.g. "under €800"). Anything else is flagged as a
 * potential hallucination.
 *
 * It is a heuristic (regexes), not a proof, but it is cheap, explainable and
 * runs on every answer: in the UI as a warning, and in the eval as a metric.
 */

export interface GroundingReport {
  grounded: boolean;
  citedIds: string[];
  /** Cited ids that no tool returned during this turn. */
  unknownIds: string[];
  /** Prices in the answer that match no tool value. */
  ungroundedPrices: number[];
  /** Spec figures ("16 GB", "65-inch") that match no tool value. */
  ungroundedSpecs: string[];
}

const ID_PATTERN = /\bP\d{4}\b/g;
// €929.99 | € 1,229.99 | 929.99€ | 929.99 EUR | 930 euros
const PRICE_PATTERN = /€\s?(\d[\d,]*(?:\.\d{1,2})?)|(\d[\d,]*(?:\.\d{1,2})?)\s?(?:€|eur\b|euros?\b)/gi;
// A number directly followed by a spec unit: "16 GB", "65-inch", "120Hz", "5000 mAh", "20h"
const SPEC_PATTERN =
  /(\d+(?:\.\d+)?)\s?(?:-\s?)?(gb|tb|mah|mp|hz|w|kg|g|mm|atm|inch(?:es)?|"|hours?|hrs?|h|days?)(?![a-z])/gi;

const toNumber = (s: string) => Number(s.replace(/,/g, ""));
const close = (a: number, b: number) => Math.abs(a - b) < 0.011;

/** Collects every number found anywhere in a JSON value (prices, specs, counts...). */
function collectNumbers(value: unknown, out: number[] = []): number[] {
  if (typeof value === "number") out.push(value);
  else if (typeof value === "string") {
    // Spec values like "IP68" or "8-core" or "5.3" also carry numbers.
    for (const m of value.matchAll(/\d+(?:\.\d+)?/g)) out.push(Number(m[0]));
  } else if (Array.isArray(value)) value.forEach((v) => collectNumbers(v, out));
  else if (value && typeof value === "object") Object.values(value).forEach((v) => collectNumbers(v, out));
  return out;
}

/** Collects every product id returned by tools (search results, details, cart lines...). */
function collectIds(value: unknown, out = new Set<string>()): Set<string> {
  if (typeof value === "string" && /^P\d{4}$/.test(value)) out.add(value);
  else if (Array.isArray(value)) value.forEach((v) => collectIds(v, out));
  else if (value && typeof value === "object") Object.values(value).forEach((v) => collectIds(v, out));
  return out;
}

/**
 * Prices the assistant may legitimately write: tool prices, their rounded forms
 * ("about €930"), simple derived amounts (2 x price, a difference between two
 * prices, a cart total) and the numbers the user typed.
 */
function allowedPrices(toolPrices: number[], userNumbers: number[]): number[] {
  const allowed = [...toolPrices, ...userNumbers];
  for (const p of toolPrices) {
    allowed.push(Math.round(p), Math.floor(p), Math.ceil(p));
    for (let q = 2; q <= 5; q++) allowed.push(p * q);
  }
  for (let i = 0; i < toolPrices.length; i++)
    for (let j = i + 1; j < toolPrices.length; j++) {
      const diff = Math.abs(toolPrices[i] - toolPrices[j]);
      allowed.push(toolPrices[i] + toolPrices[j], diff, Math.round(diff));
    }
  return allowed;
}

/** Extracts prices that the tools returned, i.e. values under a "price"/"unitPrice" key. */
function collectPrices(value: unknown, out: number[] = []): number[] {
  if (Array.isArray(value)) value.forEach((v) => collectPrices(v, out));
  else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      if (/price/i.test(k) && typeof v === "number") out.push(v);
      else collectPrices(v, out);
    }
  }
  return out;
}

export function checkGrounding(answer: string, toolCalls: ToolCallRecord[], userMessage = ""): GroundingReport {
  const successful = toolCalls.filter((c) => c.result.ok).map((c) => (c.result.ok ? c.result.data : null));
  const knownIds = collectIds(successful);
  // An error like "P0056 is out of stock" also comes from a tool.
  for (const c of toolCalls)
    if (!c.result.ok) for (const id of c.result.error.match(ID_PATTERN) ?? []) knownIds.add(id);
  const toolNumbers = collectNumbers(successful);
  const userNumbers = collectNumbers(userMessage);

  const citedIds = [...new Set(answer.match(ID_PATTERN) ?? [])];
  const unknownIds = citedIds.filter((id) => !knownIds.has(id));

  const prices = allowedPrices(collectPrices(successful), userNumbers);
  const ungroundedPrices: number[] = [];
  for (const m of answer.matchAll(PRICE_PATTERN)) {
    const value = toNumber(m[1] ?? m[2]);
    if (!prices.some((p) => close(p, value))) ungroundedPrices.push(value);
  }

  const specNumbers = [...toolNumbers, ...userNumbers];
  const ungroundedSpecs: string[] = [];
  for (const m of answer.matchAll(SPEC_PATTERN)) {
    let value = Number(m[1]);
    // 1 TB is stored as 1024 GB in the catalog.
    if (m[2].toLowerCase() === "tb") value *= 1024;
    if (!specNumbers.some((n) => close(n, value))) ungroundedSpecs.push(m[0].trim());
  }

  return {
    grounded: unknownIds.length === 0 && ungroundedPrices.length === 0 && ungroundedSpecs.length === 0,
    citedIds,
    unknownIds,
    ungroundedPrices,
    ungroundedSpecs,
  };
}
