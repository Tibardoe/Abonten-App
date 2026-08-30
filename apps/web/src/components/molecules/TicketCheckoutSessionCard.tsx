"use client";

import type { PendingCheckoutSession } from "@/actions/getUserPendingTicketCheckouts";
import QuantityStepper from "@/components/atoms/QuantityStepper";
import {
  formatCountdown,
  useCheckoutCountdown,
} from "@/hooks/useCheckoutCountdown";
import { useEffect, useRef } from "react";
import { RiDeleteBin6Line } from "react-icons/ri";

type TicketCheckoutSessionCardProps = {
  session: PendingCheckoutSession;
  selected: boolean;
  onToggleSelected: () => void;
  onQuantityChange: (ticketCheckoutId: string, newQuantity: number) => void;
  onDeleteLine: (ticketCheckoutId: string) => void;
  onRemoveSession: (checkoutSessionId: string) => void;
  onExpired: (checkoutSessionId: string) => void;
  pendingLineIds: Set<string>;
  isRemoving: boolean;
};

export default function TicketCheckoutSessionCard({
  session,
  selected,
  onToggleSelected,
  onQuantityChange,
  onDeleteLine,
  onRemoveSession,
  onExpired,
  pendingLineIds,
  isRemoving,
}: TicketCheckoutSessionCardProps) {
  const { secondsLeft, isExpired, isWarning } = useCheckoutCountdown(
    session.expiresAt,
  );
  const hasNotifiedExpiry = useRef(false);

  useEffect(() => {
    if (isExpired && !hasNotifiedExpiry.current) {
      hasNotifiedExpiry.current = true;
      onExpired(session.checkoutSessionId);
    }
  }, [isExpired, onExpired, session.checkoutSessionId]);

  return (
    <div className="border border-border rounded-2xl shadow-lg p-6 space-y-4 bg-card text-card-foreground">
      <div className="flex items-start justify-between gap-3">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggleSelected}
            className="mt-1 w-4 h-4 accent-primary"
          />
          <div>
            <h2 className="font-semibold text-lg text-card-foreground">
              {session.eventTitle}
            </h2>
            <p className="text-xs text-muted-foreground">
              {session.eventDateAndTime.date} {session.eventDateAndTime.time}
            </p>
          </div>
        </label>

        <button
          type="button"
          disabled={isRemoving}
          onClick={() => onRemoveSession(session.checkoutSessionId)}
          className="text-xs text-destructive underline disabled:opacity-40 whitespace-nowrap"
        >
          {isRemoving ? "Removing..." : "Remove checkout"}
        </button>
      </div>

      <div
        className={
          isExpired
            ? "text-xs font-medium text-destructive"
            : isWarning
              ? "text-xs font-medium text-destructive animate-pulse"
              : "text-xs text-muted-foreground"
        }
      >
        {secondsLeft === null
          ? null
          : isExpired
            ? "This checkout has expired."
            : `Expires in ${formatCountdown(secondsLeft)}`}
      </div>

      <div className="space-y-3">
        {session.lines.map((line) => {
          const isLinePending = pendingLineIds.has(line.ticketCheckoutId);
          // availableStock is what's left AFTER this line's own reservation,
          // so the stepper's ceiling is the line's current quantity plus
          // whatever's still free.
          const maxQuantity =
            line.availableStock === null
              ? null
              : line.quantity + line.availableStock;

          return (
            <div
              key={line.ticketCheckoutId}
              className="border border-border rounded-md px-4 py-3 bg-muted shadow-sm space-y-2"
            >
              <div className="flex justify-between items-center text-sm font-semibold text-foreground">
                <p>{line.type}</p>
                <button
                  type="button"
                  disabled={isLinePending}
                  onClick={() => onDeleteLine(line.ticketCheckoutId)}
                  className="hover:opacity-70 transition-opacity disabled:opacity-40"
                >
                  <RiDeleteBin6Line className="text-destructive" />
                </button>
              </div>

              <QuantityStepper
                quantity={line.quantity}
                minQuantity={1}
                maxQuantity={maxQuantity}
                disabled={isLinePending}
                onIncrement={() =>
                  onQuantityChange(line.ticketCheckoutId, line.quantity + 1)
                }
                onDecrement={() =>
                  onQuantityChange(line.ticketCheckoutId, line.quantity - 1)
                }
              />

              <div className="flex justify-between text-xs text-muted-foreground">
                <p>Unit price:</p>
                <p>
                  {line.currency} {line.unitPrice}
                </p>
              </div>

              {line.discount > 0 && (
                <div className="flex justify-between text-xs text-muted-foreground">
                  <p>Discount:</p>
                  <p>
                    -{line.currency} {line.discount.toFixed(2)}
                  </p>
                </div>
              )}

              <div className="flex justify-between text-xs font-semibold text-foreground">
                <p>Subtotal:</p>
                <p>
                  {line.currency} {line.amount.toFixed(2)}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex justify-between pt-2 border-t border-border font-bold text-card-foreground">
        <p>Checkout total</p>
        <p>
          {session.lines[0]?.currency ?? ""}{" "}
          {session.sessionSubtotal.toFixed(2)}
        </p>
      </div>
    </div>
  );
}
