"use client";

import type { PendingCheckoutSession } from "@/actions/getUserPendingTicketCheckouts";
import CheckPaymentButton from "@/components/atoms/CheckPaymentButton";
import QuantityStepper from "@/components/atoms/QuantityStepper";
import {
  formatCountdown,
  useCheckoutCountdown,
} from "@/hooks/useCheckoutCountdown";
import { formatMoney } from "@abonten/core/formatMoney";
import { ticketTypeLabel } from "@abonten/core/ticketTiers";
import { useLocale, useTranslations } from "next-intl";
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
  /** The buyer chose to pay another way despite a payment under way. */
  paymentSwitched?: boolean;
  onPayAnotherWay?: (checkoutSessionId: string) => void;
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
  paymentSwitched = false,
  onPayAnotherWay,
}: TicketCheckoutSessionCardProps) {
  const locale = useLocale();
  const t = useTranslations("common");
  const tc = useTranslations("core");

  const { secondsLeft, isExpired, isWarning } = useCheckoutCountdown(
    session.expiresAt,
  );
  const hasNotifiedExpiry = useRef(false);
  // A payment already started for this checkout (often on the phone): it
  // can't be removed or changed while the charge is open, and paying again
  // would start a second charge, so the card offers "Check payment".
  const inProgress = paymentSwitched ? null : session.paymentInProgress;
  const locked = !!inProgress;

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
            checked={selected && !locked}
            disabled={locked}
            onChange={onToggleSelected}
            className="mt-1 w-4 h-4 accent-primary disabled:opacity-40"
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

        {locked ? null : (
          <button
            type="button"
            disabled={isRemoving}
            onClick={() => onRemoveSession(session.checkoutSessionId)}
            className="text-xs text-destructive underline disabled:opacity-40 whitespace-nowrap"
          >
            {isRemoving ? t("removing") : t("removeCheckout")}
          </button>
        )}
      </div>

      {inProgress ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-primary/40 bg-primary/10 px-4 py-3 text-sm">
          <p className="flex-1 min-w-[12rem]">
            {inProgress.stage === "finishing"
              ? t("paymentReceivedTicketsOnTheWay")
              : t("aPaymentForThisOrderIsBeingConfirmed")}
          </p>
          <div className="flex items-center gap-3">
            {onPayAnotherWay && inProgress.stage === "awaiting" ? (
              <button
                type="button"
                onClick={() => onPayAnotherWay(session.checkoutSessionId)}
                className="text-xs font-medium text-primary underline"
              >
                {t("payAnotherWay")}
              </button>
            ) : null}
            <CheckPaymentButton attemptId={inProgress.attemptId} />
          </div>
        </div>
      ) : null}

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
            ? t("thisCheckoutHasExpired")
            : t("expiresIn", { formatCountdown: formatCountdown(secondsLeft) })}
      </div>

      <div className="space-y-3">
        {session.lines.map((line) => {
          const isLinePending = pendingLineIds.has(line.ticketCheckoutId);
          // The stepper counts purchases: a Couple ticket is one purchase of
          // two tickets (admits). availableStock is the places left AFTER
          // this line's own reservation, so the ceiling is the line's
          // purchases plus the whole purchases still free.
          const admits = Math.max(1, line.admits ?? 1);
          const purchases = line.purchases ?? line.quantity / admits;
          const maxQuantity =
            line.availableStock === null
              ? null
              : purchases + Math.floor(line.availableStock / admits);

          return (
            <div
              key={line.ticketCheckoutId}
              className="border border-border rounded-md px-4 py-3 bg-muted shadow-sm space-y-2"
            >
              <div className="flex justify-between items-center text-sm font-semibold text-foreground">
                <div className="min-w-0">
                  <p>{ticketTypeLabel(tc, line.type)}</p>
                  {line.description ? (
                    <p className="text-xs font-normal text-muted-foreground">
                      {line.description}
                    </p>
                  ) : null}
                </div>
                <button
                  type="button"
                  disabled={isLinePending || locked}
                  onClick={() => onDeleteLine(line.ticketCheckoutId)}
                  className="hover:opacity-70 transition-opacity disabled:opacity-40"
                  aria-label={t("removeTickets", {
                    type: ticketTypeLabel(tc, line.type),
                  })}
                >
                  <RiDeleteBin6Line className="text-destructive" aria-hidden />
                </button>
              </div>

              {line.openAmount ? (
                // An amount the buyer chose: one ticket at that amount. To
                // change it, the line is removed and chosen again.
                <div className="flex justify-between text-sm text-foreground">
                  <p>{t("yourAmount")}</p>
                  <p className="font-semibold">
                    {formatMoney(line.currency, line.amount, { locale })}
                  </p>
                </div>
              ) : (
                <QuantityStepper
                  label={t("tickets3", {
                    type: ticketTypeLabel(tc, line.type),
                  })}
                  quantity={purchases}
                  minQuantity={1}
                  maxQuantity={maxQuantity}
                  disabled={isLinePending || locked}
                  onIncrement={() =>
                    onQuantityChange(line.ticketCheckoutId, purchases + 1)
                  }
                  onDecrement={() =>
                    onQuantityChange(line.ticketCheckoutId, purchases - 1)
                  }
                />
              )}

              {admits > 1 && (
                <p className="text-xs text-muted-foreground">
                  {t("admitsPeopleEachOwnTicket", { count: admits })}
                </p>
              )}

              {line.openAmount ? null : (
                <div className="flex justify-between text-xs text-muted-foreground">
                  <p>{t("unitPrice")}</p>
                  <p>
                    {formatMoney(line.currency, line.unitPrice, { locale })}
                  </p>
                </div>
              )}

              {line.discount > 0 && (
                <div className="flex justify-between text-xs text-muted-foreground">
                  <p>
                    {line.groupDiscountPercent
                      ? t("groupDiscount")
                      : t("discount3")}
                  </p>
                  <p>
                    −{formatMoney(line.currency, line.discount, { locale })}
                  </p>
                </div>
              )}

              <div className="flex justify-between text-xs font-semibold text-foreground">
                <p>{t("subtotal2")}</p>
                <p>{formatMoney(line.currency, line.amount, { locale })}</p>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex justify-between pt-2 border-t border-border font-bold text-card-foreground">
        <p>{t("checkoutTotal")}</p>
        <p>
          {formatMoney(session.lines[0]?.currency, session.sessionSubtotal, {
            locale,
          })}
        </p>
      </div>
    </div>
  );
}
