"use client";

import { useEffect, useRef, useState } from "react";
import type { CartLine } from "@/lib/tools/tools";
import { addToCart, applyEvent, cartTotal, splitNdjson, type UiMessage } from "@/lib/client/state";
import { formatPrice } from "@/lib/format";
import { CartPanel } from "./CartPanel";
import { Message } from "./Message";

const SUGGESTIONS = [
  "Noise-cancelling headphones under €200",
  "A light laptop for travel with 16GB RAM",
  "An OLED TV for movies",
  "Something to track my runs",
];

let nextId = 0;
const newId = () => `m${++nextId}`;

interface ModeInfo {
  mode: "mock" | "real";
  model: string | null;
}

export function Chat() {
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<ModeInfo | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/mode")
      .then((r) => r.json())
      .then(setMode)
      .catch(() => setMode(null));
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  async function send(text: string) {
    const content = text.trim();
    if (!content || busy) return;
    setInput("");
    setBusy(true);

    const user: UiMessage = { id: newId(), role: "user", text: content, toolCalls: [] };
    const assistant: UiMessage = { id: newId(), role: "assistant", text: "", toolCalls: [], pending: true };
    // The server only needs the text of each turn.
    const history = [...messages, user].map((m) => ({ role: m.role, content: m.text || "(no answer)" }));
    setMessages((prev) => [...prev, user, assistant]);

    const update = (fn: (m: UiMessage) => UiMessage) =>
      setMessages((prev) => prev.map((m) => (m.id === assistant.id ? fn(m) : m)));

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history }),
      });
      if (!response.ok || !response.body) throw new Error((await response.json()).error ?? "Request failed");

      // Read the NDJSON stream chunk by chunk and apply each event as it arrives.
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        const { events, rest } = splitNdjson(buffer + decoder.decode(value, { stream: true }));
        buffer = rest;
        for (const event of events) {
          update((m) => applyEvent(m, event));
          // The cart lives in the browser: a successful add_to_cart tool call adds a line.
          if (event.type === "tool_result" && event.name === "add_to_cart" && event.result.ok) {
            const line = event.result.data as CartLine;
            setCart((c) => addToCart(c, line));
          }
        }
      }
    } catch (err) {
      update((m) => ({ ...m, error: err instanceof Error ? err.message : "Something went wrong" }));
    } finally {
      update((m) => ({ ...m, pending: false }));
      setBusy(false);
    }
  }

  return (
    <div className="flex h-dvh flex-col bg-[var(--bg)] text-[var(--fg)]">
      <header className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--panel)] px-4 py-3 sm:px-6">
        <div className="flex items-center gap-3">
          <div className="grid size-9 place-items-center rounded-xl bg-[var(--accent)] text-lg font-bold text-white">
            V
          </div>
          <div>
            <h1 className="text-base font-semibold leading-tight">Voltix assistant</h1>
            <p className="hidden text-xs text-[var(--muted)] sm:block">
              Fictional electronics store · AI shopping assistant demo
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {cart.length > 0 && (
            <span className="rounded-full bg-[var(--bg)] px-3 py-1 text-xs font-medium md:hidden">
              🛒 {cart.reduce((n, l) => n + l.quantity, 0)} · {formatPrice(cartTotal(cart))}
            </span>
          )}
          {mode && (
            <span
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                mode.mode === "mock" ? "bg-amber-100 text-amber-900" : "bg-emerald-100 text-emerald-900"
              }`}
              title={
                mode.mode === "mock"
                  ? "No API key: scripted agent calling the real tools"
                  : "Live LLM with tool calling"
              }
            >
              {mode.mode === "mock" ? (
                <>
                  Mock mode<span className="hidden sm:inline"> (no API key)</span>
                </>
              ) : (
                `Live · ${mode.model}`
              )}
            </span>
          )}
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <main className="flex min-w-0 flex-1 flex-col">
          <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
            <div className="mx-auto flex max-w-3xl flex-col gap-6">
              {messages.length === 0 && (
                <div className="mt-8 text-center">
                  <h2 className="text-2xl font-semibold">What are you shopping for?</h2>
                  <p className="mt-2 text-sm text-[var(--muted)]">
                    I search our catalog of 200 products, compare them and fill your cart. Every price and spec comes
                    from the catalog, never from my imagination.
                  </p>
                  <div className="mt-6 flex flex-wrap justify-center gap-2">
                    {SUGGESTIONS.map((s) => (
                      <button
                        key={s}
                        onClick={() => send(s)}
                        className="rounded-full border border-[var(--border)] bg-[var(--panel)] px-4 py-2 text-sm hover:border-[var(--accent)]"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {messages.map((m) => (
                <Message key={m.id} message={m} onAsk={send} disabled={busy} />
              ))}
              <div ref={bottomRef} />
            </div>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
            className="border-t border-[var(--border)] bg-[var(--panel)] px-4 py-3 sm:px-6"
          >
            <div className="mx-auto flex max-w-3xl gap-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask for a product, a comparison, or add something to your cart…"
                className="min-w-0 flex-1 rounded-xl border border-[var(--border)] bg-[var(--bg)] px-4 py-3 text-sm outline-none focus:border-[var(--accent)]"
                aria-label="Message"
              />
              <button
                type="submit"
                disabled={busy || !input.trim()}
                className="rounded-xl bg-[var(--accent)] px-5 text-sm font-medium text-white disabled:opacity-40"
              >
                {busy ? "…" : "Send"}
              </button>
            </div>
          </form>
        </main>

        <CartPanel cart={cart} onRemove={(id) => setCart((c) => c.filter((l) => l.productId !== id))} />
      </div>
    </div>
  );
}
