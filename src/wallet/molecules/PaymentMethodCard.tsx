"use client";

import type {
  CardPaymentMethodDetails,
  MomoPaymentMethodDetails,
  PaymentMethodRow,
} from "@/actions/getUserPaymentMethods";
import { cn } from "@/components/lib/utils";
import { Button } from "@/components/ui/button";

type PaymentMethodCardProps = {
  method: PaymentMethodRow;
  selected?: boolean;
  onSelect?: () => void;
  onSetDefault?: () => void;
  onRemove?: () => void;
  removing?: boolean;
};

export function getPaymentMethodDisplay(method: PaymentMethodRow) {
  if (method.method_type === "momo") {
    const details = method.details as MomoPaymentMethodDetails &
      // Wallets saved before real phone numbers/network codes were
      // collected only ever stored `network`/`last4` — displayed here
      // rather than crashing, since there's no way to recover a real phone
      // number from a last-4-digits-only record.
      Partial<{ network: string; last4: string }>;
    const networkName =
      details.networkName ?? details.network ?? "Mobile Money";
    const maskedNumber = details.phone
      ? `•••• ${details.phone.slice(-4)}`
      : details.last4
        ? `•••• ${details.last4}`
        : "";
    return {
      title: details.label?.trim() || networkName,
      subtitle: `${networkName} ${maskedNumber}`.trim(),
    };
  }

  const details = method.details as CardPaymentMethodDetails;
  const expiry = `${String(details.expiryMonth).padStart(2, "0")}/${String(
    details.expiryYear,
  ).slice(-2)}`;

  return {
    title: details.label?.trim() || details.brand,
    subtitle: `${details.brand} •••• ${details.last4} · exp ${expiry}`,
  };
}

export default function PaymentMethodCard({
  method,
  selected,
  onSelect,
  onSetDefault,
  onRemove,
  removing,
}: PaymentMethodCardProps) {
  const { title, subtitle } = getPaymentMethodDisplay(method);
  const isSelectable = Boolean(onSelect);

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
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>

        {method.is_default && (
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
            Default
          </span>
        )}
      </div>

      {(onSetDefault || onRemove) && (
        <div className="flex shrink-0 items-center gap-2">
          {onSetDefault && !method.is_default && (
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
