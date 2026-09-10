"use client";

import { cn } from "@/components/lib/utils";
import { formatCredit } from "@abonten/core/rewards/creditAmount";
import type { CreditQuote } from "@abonten/types/rewards";

// The checkout "Use credit" switch (promotions now, tickets in Phase 3).
// It only shows what the server quoted — the amount applied is decided
// again, under a lock, when the payment starts.
export default function UseCreditToggle({
  quote,
  checked,
  onChange,
  disabled,
}: {
  quote: CreditQuote;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-2 rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-semibold">
            Use {formatCredit(quote.creditMinor)} Abonten Credit
          </p>
          <p className="text-xs text-muted-foreground">
            {quote.creditOnly
              ? "Your credit covers this. No card or wallet is charged."
              : `You have ${formatCredit(quote.spendableMinor)} you can use here.`}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={checked}
          aria-label="Use Abonten Credit"
          disabled={disabled}
          onClick={() => onChange(!checked)}
          className={cn(
            "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
            checked ? "bg-primary" : "bg-muted-foreground/30",
          )}
        >
          <span
            className={cn(
              "inline-block h-5 w-5 rounded-full bg-background shadow transition-transform",
              checked ? "translate-x-5" : "translate-x-0.5",
            )}
          />
        </button>
      </div>

      {checked ? (
        <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 border-t border-border pt-2 text-sm tabular-nums">
          <dt className="text-muted-foreground">Total</dt>
          <dd className="text-right">{formatCredit(quote.orderTotalMinor)}</dd>
          <dt className="text-muted-foreground">Credit</dt>
          <dd className="text-right">−{formatCredit(quote.creditMinor)}</dd>
          <dt className="font-semibold">You pay</dt>
          <dd className="text-right font-semibold">
            {formatCredit(quote.cashMinor)}
          </dd>
        </dl>
      ) : null}
    </div>
  );
}
