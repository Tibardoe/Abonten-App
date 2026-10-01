import type { getTickets } from "@/actions/getTickets";
import QuantityStepper from "@/components/atoms/QuantityStepper";
import { formatSingleDateTime } from "@abonten/core/dateFormatter";
import { formatMoney } from "@abonten/core/formatMoney";
import { useLocale, useTranslations } from "next-intl";
import { MdDiscount } from "react-icons/md";

type Ticket = NonNullable<
  Awaited<ReturnType<typeof getTickets>>["tickets"]
>[number];

type CheckoutTicketRowProps = {
  ticket: Ticket;
  quantity: number;
  eligibleUnits: number;
  discountedUnitPrice: number | null;
  hasAppliedPromo: boolean;
  onIncrement: () => void;
  onDecrement: () => void;
};

export default function CheckoutTicketRow({
  ticket,
  quantity,
  eligibleUnits,
  discountedUnitPrice,
  hasAppliedPromo,
  onIncrement,
  onDecrement,
}: CheckoutTicketRowProps) {
  const locale = useLocale();

  const t = useTranslations("common");

  return (
    <div
      className={`border-2 rounded-md py-4 space-y-4 ${
        quantity > 0 ? "border-primary" : "border-border"
      }`}
    >
      <div className="flex items-center justify-between px-4">
        <p>{ticket.type}</p>

        <QuantityStepper
          label={t("ticketsOfType", { type: ticket.type ?? "" })}
          quantity={quantity}
          maxQuantity={ticket.quantity}
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
                  {formatMoney(ticket.currency, discountedUnitPrice)}{" "}
                  <MdDiscount
                    className="text-lg"
                    aria-label={t("discounted")}
                  />
                </span>
              ) : (
                formatMoney(ticket.currency, ticket.price)
              )}
            </p>

            {quantity > 0 && hasAppliedPromo && eligibleUnits < quantity && (
              <p className="text-xs text-muted-foreground">
                {t("discountAppliesToOf", {
                  eligibleUnits: eligibleUnits,
                  quantity: quantity,
                })}
              </p>
            )}
          </div>

          <p
            className={
              ticket.quantity === 0
                ? "text-destructive font-semibold"
                : "text-sm text-muted-foreground"
            }
          >
            {ticket.quantity === null
              ? t("unlimited")
              : ticket.quantity === 0
                ? t("soldOut")
                : t("left", { quantity: ticket.quantity })}
          </p>
        </div>

        {ticket.type !== "SINGLE TICKET" && ticket.available_until && (
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
