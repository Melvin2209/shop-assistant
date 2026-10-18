import type { AgentEvent } from "@/lib/agent/types";
import type { GroundingReport } from "@/lib/agent/grounding";
import type { CartLine, ToolName, ToolResult } from "@/lib/tools/tools";

/**
 * Pure state helpers for the chat UI, kept out of React components so they can
 * be unit-tested.
 */

export interface UiToolCall {
  id: string;
  name: ToolName;
  input: unknown;
  result?: ToolResult;
}

export interface UiMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  toolCalls: UiToolCall[];
  grounding?: GroundingReport;
  error?: string;
  pending?: boolean;
}

/** The fields a product card needs; present in every tool result that returns products. */
export interface CardProduct {
  id: string;
  name: string;
  brand: string;
  price: number;
  rating: number;
  reviewCount: number;
  inStock: boolean;
  category: string;
}

/** Applies one streamed event to the assistant message being built. */
export function applyEvent(message: UiMessage, event: AgentEvent): UiMessage {
  switch (event.type) {
    case "text":
      return { ...message, text: message.text + event.delta };
    case "tool_call":
      return { ...message, toolCalls: [...message.toolCalls, { id: event.id, name: event.name, input: event.input }] };
    case "tool_result":
      return {
        ...message,
        toolCalls: message.toolCalls.map((c) => (c.id === event.id ? { ...c, result: event.result } : c)),
      };
    case "grounding":
      return { ...message, grounding: event.report };
    case "error":
      return { ...message, error: event.message };
    case "done":
      return { ...message, pending: false };
  }
}

/** Parses an NDJSON chunk stream: returns complete events and the unfinished remainder. */
export function splitNdjson(buffer: string): { events: AgentEvent[]; rest: string } {
  const lines = buffer.split("\n");
  const rest = lines.pop() ?? "";
  return { events: lines.filter((l) => l.trim()).map((l) => JSON.parse(l) as AgentEvent), rest };
}

/** Every product returned by the tools of a message, by id. */
export function productsFromToolCalls(calls: UiToolCall[]): Map<string, CardProduct> {
  const found = new Map<string, CardProduct>();
  const visit = (value: unknown) => {
    if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === "object") {
      const v = value as Record<string, unknown>;
      if (typeof v.id === "string" && typeof v.price === "number" && typeof v.name === "string") {
        found.set(v.id, v as unknown as CardProduct);
      }
      Object.values(v).forEach(visit);
    }
  };
  for (const c of calls) if (c.result?.ok) visit(c.result.data);
  return found;
}

/** Adds a line to the cart, merging quantities of the same product. */
export function addToCart(cart: CartLine[], line: CartLine): CartLine[] {
  const existing = cart.find((l) => l.productId === line.productId);
  if (!existing) return [...cart, line];
  return cart.map((l) => (l.productId === line.productId ? { ...l, quantity: l.quantity + line.quantity } : l));
}

export const cartTotal = (cart: CartLine[]) =>
  Math.round(cart.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0) * 100) / 100;
