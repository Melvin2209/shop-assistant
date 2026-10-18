import { cartTotal } from "@/lib/client/state";
import { formatPrice } from "@/lib/format";
import type { CartLine } from "@/lib/tools/tools";

export function CartPanel({ cart, onRemove }: { cart: CartLine[]; onRemove: (productId: string) => void }) {
  const count = cart.reduce((n, l) => n + l.quantity, 0);
  return (
    <aside className="hidden w-72 shrink-0 flex-col border-l border-[var(--border)] bg-[var(--panel)] md:flex">
      <div className="border-b border-[var(--border)] px-4 py-3">
        <h2 className="text-sm font-semibold">
          Cart {count > 0 && <span className="text-[var(--muted)]">({count})</span>}
        </h2>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {cart.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">Your cart is empty. Ask the assistant to add a product.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {cart.map((l) => (
              <li key={l.productId} className="text-sm">
                <div className="flex justify-between gap-2">
                  <span className="font-medium">{l.name}</span>
                  <button
                    onClick={() => onRemove(l.productId)}
                    className="text-xs text-[var(--muted)] hover:text-rose-600"
                    aria-label={`Remove ${l.name}`}
                  >
                    ✕
                  </button>
                </div>
                <div className="text-xs text-[var(--muted)]">
                  {l.quantity} × {formatPrice(l.unitPrice)}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="border-t border-[var(--border)] px-4 py-3 text-sm">
        <div className="flex justify-between font-semibold">
          <span>Total</span>
          <span>{formatPrice(cartTotal(cart))}</span>
        </div>
        <p className="mt-1 text-xs text-[var(--muted)]">Demo store: no checkout.</p>
      </div>
    </aside>
  );
}
