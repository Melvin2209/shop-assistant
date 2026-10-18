import type { CardProduct } from "@/lib/client/state";
import { formatPrice } from "@/lib/format";

export function ProductCard({
  product: p,
  onAsk,
  disabled,
}: {
  product: CardProduct;
  onAsk: (text: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="flex flex-col justify-between gap-2 rounded-xl border border-[var(--border)] bg-[var(--panel)] p-3 text-sm">
      <div>
        <div className="flex items-start justify-between gap-2">
          <span className="font-medium leading-snug">{p.name}</span>
          <span className="citation shrink-0">{p.id}</span>
        </div>
        <div className="mt-1 text-xs text-[var(--muted)]">
          {p.brand} · {p.category} · ★ {p.rating} ({p.reviewCount})
        </div>
      </div>
      <div className="flex items-center justify-between">
        <span className="font-semibold">{formatPrice(p.price)}</span>
        {/* Actions go through the assistant, so they use the same tools and guardrails. */}
        <div className="flex gap-1">
          <button
            disabled={disabled}
            onClick={() => onAsk(`Tell me more about ${p.id}`)}
            className="rounded-lg border border-[var(--border)] px-2 py-1 text-xs hover:border-[var(--accent)] disabled:opacity-40"
          >
            Details
          </button>
          <button
            disabled={disabled || !p.inStock}
            onClick={() => onAsk(`Add ${p.id} to my cart`)}
            className="rounded-lg bg-[var(--accent)] px-2 py-1 text-xs text-white disabled:opacity-40"
          >
            {p.inStock ? "Add to cart" : "Out of stock"}
          </button>
        </div>
      </div>
    </div>
  );
}
