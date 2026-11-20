import type { getTickets } from "@/actions/getTickets";
import QuantityStepper from "@/components/atoms/QuantityStepper";
import { formatSingleDateTime } from "@abonten/core/dateFormatter";
import { formatMoney } from "@abonten/core/formatMoney";
import { SINGLE_TICKET_TYPE, ticketTypeLabel } from "@abonten/core/ticketTiers";
import { useLocale, useTranslations } from "next-intl";
import { MdDiscount } from "react-icons/md";

type Ticket = NonNullable<
  Awaited<ReturnType<typeof getTickets>>["tickets"]
>[number];

type CheckoutTicketRowProps = {
  ticket: Ticket;
  /** Purchases picked (a Couple counts once). */
  quantity: number;
  /** Purchases still on sale (null = no limit). */
  purchasesLeft: number | null;
  /** Tickets the promo code covers on this line. */
  eligibleUnits: number;
  discountedUnitPrice: number | null;
  hasAppliedPromo: boolean;
  onIncrement: () => void;
  onDecrement: () => void;
};

export default function CheckoutTicketRow({
  ticket,
  quantity,
  purchasesLeft,
  eligibleUnits,
  discountedUnitPrice,
  hasAppliedPromo,
  onIncrement,
  onDecrement,
}: CheckoutTicketRowProps) {
  const locale = useLocale();

  const t = useTranslations("common");
  const tc = useTranslations("core");
  // "Standard ticket" / "Free" for the tiers the system names itself.
  const tierName = ticketTypeLabel(tc, ticket.type);
  // A group ticket (a Couple) admits several people, one ticket each.
  const admits = Math.max(1, ticket.admits ?? 1);
  const tickets = quantity * admits;

  return (
    <div
      className={`border-2 rounded-md py-4 space-y-4 ${
        quantity > 0 ? "border-primary" : "border-border"
      }`}
    >
      <div className="flex items-center justify-between px-4">
        <div>
          <p>{tierName}</p>
          {/* A pass (docs/architecture/show-passes.md): this show and
              more chosen from the ticket afterwards. */}
          {ticket.pass_shows ? (
            <p className="text-xs text-muted-foreground">
              {t("passForShows", { shows: ticket.pass_shows })}
            </p>
          ) : null}
        </div>

        <QuantityStepper
          label={t("ticketsOfType", { type: tierName })}
          quantity={quantity}
          maxQuantity={purchasesLeft}
          onIncrement={onIncrement}
          onDecrement={onDecrement}
        />
      </div>

      <hr className="border-border" />

      <div className="flex flex-col items-start gap-2 px-4">
        <div className="flex justify-between items-center w-full font-bold">
          <div className="flex flex-col">
            <p className="flex items-center gap-2">
              {discountedUnitPrice !== null ? (
                <span className="flex justify-center items-center gap-1">
                  {formatMoney(ticket.currency, discountedUnitPrice, {
                    locale,
                  })}{" "}
                  <MdDiscount
                    className="text-lg"
                    aria-label={t("discounted")}
                  />
                </span>
              ) : (
                formatMoney(ticket.currency, ticket.price, { locale })
              )}
            </p>

            {admits > 1 && (
              <p className="text-xs font-normal text-muted-foreground">
                {t("admitsPeopleEachOwnTicket", { count: admits })}
              </p>
            )}

            {quantity > 0 &&
              hasAppliedPromo &&
              eligibleUnits > 0 &&
              eligibleUnits < tickets && (
                <p className="text-xs text-muted-foreground">
                  {t("discountAppliesToOf", {
                    eligibleUnits: eligibleUnits,
                    quantity: tickets,
                  })}
                </p>
              )}
          </div>

          <p
            className={
              purchasesLeft === 0
                ? "text-destructive font-semibold"
                : "text-sm text-muted-foreground"
            }
          >
            {purchasesLeft === null
              ? t("unlimited")
              : purchasesLeft === 0
                ? t("soldOut")
                : t("left", { quantity: purchasesLeft })}
          </p>
        </div>

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
