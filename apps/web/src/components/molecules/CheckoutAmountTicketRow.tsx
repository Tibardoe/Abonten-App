import type { getTickets } from "@/actions/getTickets";
import { formatSingleDateTime } from "@abonten/core/dateFormatter";
import { formatMoney } from "@abonten/core/formatMoney";
import {
  type OpenAmountRange,
  chosenAmountProblem,
  chosenAmountProblemMessage,
  openAmountQuickPicks,
  openAmountRangeHint,
} from "@abonten/core/openAmountTickets";
import { SINGLE_TICKET_TYPE, ticketTypeLabel } from "@abonten/core/ticketTiers";
import { useLocale, useTranslations } from "next-intl";

type Ticket = NonNullable<
  Awaited<ReturnType<typeof getTickets>>["tickets"]
>[number];

type CheckoutAmountTicketRowProps = {
  ticket: Ticket;
  range: OpenAmountRange;
  /** What the buyer typed (or the quick pick they tapped). */
  amountText: string;
  onAmountTextChange: (text: string) => void;
  /** Purchases still on sale (null = no limit). */
  purchasesLeft: number | null;
};

/**
 * A ticket type whose amount the buyer chooses
 * (docs/architecture/open-amount-tickets.md): the range, a few amounts to
 * tap and a field to type one. A valid amount is one ticket at that amount;
 * an empty field picks nothing. Promo codes and group prices never apply.
 */
export default function CheckoutAmountTicketRow({
  ticket,
  range,
  amountText,
  onAmountTextChange,
  purchasesLeft,
}: CheckoutAmountTicketRowProps) {
  const locale = useLocale();
  const t = useTranslations("common");
  const tc = useTranslations("core");
  const currency = ticket.currency;
  const tierName = ticketTypeLabel(tc, ticket.type);
  const typed = amountText.trim() !== "";
  const problem = typed
    ? chosenAmountProblem(amountText, range, currency)
    : null;
  const selected = typed && problem === null;
  const soldOut = purchasesLeft === 0;
  const inputId = `amount-${ticket.id}`;
  const hintId = `amount-hint-${ticket.id}`;

  return (
    <div
      className={`border-2 rounded-md py-4 space-y-4 ${
        selected ? "border-primary" : "border-border"
      }`}
    >
      <div className="flex items-start justify-between gap-4 px-4">
        <div>
          <p>{tierName}</p>
          {/* What the amount buys ("Ride credits, loaded at the gate"). */}
          {ticket.description ? (
            <p className="text-xs text-muted-foreground">
              {ticket.description}
            </p>
          ) : null}
        </div>
        <p
          className={
            soldOut
              ? "text-destructive font-semibold"
              : "text-sm text-muted-foreground"
          }
        >
          {purchasesLeft === null
            ? t("unlimited")
            : soldOut
              ? t("soldOut")
              : t("left", { quantity: purchasesLeft })}
        </p>
      </div>

      <hr className="border-border" />

      <div className="flex flex-col gap-3 px-4">
        <label htmlFor={inputId} className="text-sm font-semibold">
          {t("chooseYourAmount")}
        </label>
        <p id={hintId} className="text-xs text-muted-foreground">
          {openAmountRangeHint(tc, range, currency, locale)}
        </p>

        <div className="flex flex-wrap gap-2">
          {openAmountQuickPicks(range, currency).map((amount) => {
            const active = selected && Number(amountText) === amount;
            return (
              <button
                key={amount}
                type="button"
                disabled={soldOut}
                aria-pressed={active}
                onClick={() => onAmountTextChange(String(amount))}
                className={`rounded-full border px-3 py-1 text-sm transition-colors disabled:opacity-50 ${
                  active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border hover:bg-muted"
                }`}
              >
                {formatMoney(currency, amount, {
                  locale,
                  trimZeroFraction: true,
                })}
              </button>
            );
          })}
        </div>

        <div className="flex h-10 w-full items-center gap-2 rounded-md border border-input bg-background px-3 shadow-sm transition-colors focus-within:border-ring focus-within:ring-1 focus-within:ring-ring">
          <span className="text-sm text-muted-foreground">{currency}</span>
          <input
            id={inputId}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            disabled={soldOut}
            value={amountText}
            onChange={(e) => onAmountTextChange(e.target.value)}
            aria-describedby={hintId}
            aria-invalid={problem !== null}
            className="w-full bg-transparent text-base outline-none placeholder:text-muted-foreground md:text-sm"
          />
        </div>

        {problem ? (
          <p role="alert" className="text-sm text-destructive">
            {chosenAmountProblemMessage(tc, problem, range, currency, locale)}
          </p>
        ) : null}

        <p className="text-xs text-muted-foreground">
          {t("openAmountNoDiscounts")}
        </p>

        {ticket.type !== SINGLE_TICKET_TYPE && ticket.available_until && (
          <p className="text-sm">
            {t("salesEndOn", {
              date: formatSingleDateTime(
                ticket.available_until,
                undefined,
                locale,
              ).date,
            })}
          </p>
        )}
      </div>
    </div>
  );
}
