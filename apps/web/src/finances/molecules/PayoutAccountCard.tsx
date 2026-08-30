"use client";

import { cn } from "@/components/lib/utils";
import { Button } from "@/components/ui/button";
import { maskAccountNumber } from "@/utils/maskAccountNumber";
import type { PayoutAccountRow } from "@abonten/types/organizerFinance";

type PayoutAccountCardProps = {
  account: PayoutAccountRow;
  selected?: boolean;
  onSelect?: () => void;
  onSetDefault?: () => void;
  onRemove?: () => void;
  removing?: boolean;
};

// Mirrors PaymentMethodCard.tsx's exact selectable-card shape (used for the
// buyer-side wallet), applied here to organizer payout destinations — same
// visual language, different data source, never mixed.
export default function PayoutAccountCard({
  account,
  selected,
  onSelect,
  onSetDefault,
  onRemove,
  removing,
}: PayoutAccountCardProps) {
  const isSelectable = Boolean(onSelect);
  const title =
    account.account_type === "mobile_money"
      ? (account.provider ?? "Mobile Money")
      : "Bank Account";

  return (
    <div
      onClick={onSelect}
      onKeyDown={
        isSelectable
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") onSelect?.();
            }
          : undefined
      }
      role={isSelectable ? "button" : undefined}
      tabIndex={isSelectable ? 0 : undefined}
      className={cn(
        "flex items-center justify-between gap-3 rounded-xl border border-border bg-card text-card-foreground p-4",
        isSelectable && "cursor-pointer",
        selected && "border-primary",
      )}
    >
      <div className="flex items-center gap-3">
        {isSelectable && (
          <span
            className={cn(
              "grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 border-border",
              selected && "border-primary",
            )}
          >
            {selected && (
              <span className="h-2.5 w-2.5 rounded-full bg-primary" />
            )}
          </span>
        )}

        <div>
          <p className="font-medium text-sm">{title}</p>
          <p className="text-xs text-muted-foreground">
            {account.account_holder_name} ·{" "}
            {maskAccountNumber(account.account_number)}
          </p>
        </div>

        {account.is_default && (
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
            Default
          </span>
        )}
      </div>

      {(onSetDefault || onRemove) && (
        <div className="flex shrink-0 items-center gap-2">
          {onSetDefault && !account.is_default && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onSetDefault();
              }}
            >
              Set as default
            </Button>
          )}
          {onRemove && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={removing}
              onClick={(e) => {
                e.stopPropagation();
                onRemove();
              }}
              className="text-destructive hover:text-destructive"
            >
              {removing ? "Removing..." : "Remove"}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
