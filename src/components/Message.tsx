"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { productsFromToolCalls, type UiMessage } from "@/lib/client/state";
import { formatPrice } from "@/lib/format";
import { ProductCard } from "./ProductCard";

const TOOL_LABELS: Record<string, string> = {
  search_products: "Searched the catalog",
  get_product_details: "Read product details",
  compare_products: "Compared products",
  add_to_cart: "Added to cart",
};

/** Turns "[P0042]" citations into links that the markdown renderer shows as chips. */
const linkCitations = (text: string) => text.replace(/\[(P\d{4})\]/g, "[$1](#$1)");

export function Message({
  message,
  onAsk,
  disabled,
}: {
  message: UiMessage;
  onAsk: (text: string) => void;
  disabled: boolean;
}) {
  if (message.role === "user") {
    return (
      <div className="ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-[var(--accent)] px-4 py-2.5 text-sm text-white">
        {message.text}
      </div>
    );
  }

  const products = productsFromToolCalls(message.toolCalls);
  // Show a card for each product cited in the answer, in citation order.
  const cited = [...new Set(message.text.match(/P\d{4}/g) ?? [])].filter((id) => products.has(id));
  const report = message.grounding;

  return (
    <div className="flex max-w-full flex-col gap-3">
      {message.toolCalls.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {message.toolCalls.map((c) => (
            <details key={c.id} className="group rounded-lg border border-[var(--border)] bg-[var(--panel)] text-xs">
              <summary className="cursor-pointer list-none px-2.5 py-1 text-[var(--muted)]">
                <span className={c.result ? (c.result.ok ? "text-emerald-600" : "text-rose-600") : ""}>
                  {c.result ? (c.result.ok ? "✓" : "✗") : "…"}
                </span>{" "}
                {TOOL_LABELS[c.name] ?? c.name} <code className="ml-1 opacity-60">{c.name}</code>
              </summary>
              <pre className="max-w-[min(80vw,40rem)] overflow-x-auto border-t border-[var(--border)] px-2.5 py-2 text-[11px] leading-relaxed">
                {JSON.stringify(c.input, null, 2)}
                {c.result && !c.result.ok ? `\n\nError: ${c.result.error}` : ""}
              </pre>
            </details>
          ))}
        </div>
      )}

      {(message.text || message.pending) && (
        <div className="markdown rounded-2xl rounded-bl-sm border border-[var(--border)] bg-[var(--panel)] px-4 py-3 text-sm">
          {message.text ? (
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                a: ({ href, children }) => {
                  const id = href?.startsWith("#P") ? href.slice(1) : null;
                  if (!id) return <a href={href}>{children}</a>;
                  const p = products.get(id);
                  return (
                    <span
                      className="citation"
                      title={p ? `${p.name} · ${formatPrice(p.price)}` : "Not found in tool results"}
                    >
                      {children}
                    </span>
                  );
                },
              }}
            >
              {linkCitations(message.text)}
            </ReactMarkdown>
          ) : (
            <span className="animate-pulse text-[var(--muted)]">Thinking…</span>
          )}
        </div>
      )}

      {message.error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
          {message.error}
        </div>
      )}

      {cited.length > 0 && !message.pending && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {cited.map((id) => (
            <ProductCard key={id} product={products.get(id)!} onAsk={onAsk} disabled={disabled} />
          ))}
        </div>
      )}

      {report && !message.pending && (report.citedIds.length > 0 || !report.grounded) && (
        <p className={`text-xs ${report.grounded ? "text-emerald-700" : "text-amber-700"}`}>
          {report.grounded
            ? `✓ Grounded: every price, spec and product cited comes from tool results (${report.citedIds.length} product${report.citedIds.length > 1 ? "s" : ""} cited).`
            : `⚠ Unverified in this answer: ${[
                ...report.unknownIds,
                ...report.ungroundedPrices.map((p) => `€${p}`),
                ...report.ungroundedSpecs,
              ].join(", ")}. Please double-check on the product page.`}
        </p>
      )}
    </div>
  );
}
