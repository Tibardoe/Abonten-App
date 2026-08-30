import type { getTickets } from "@/actions/getTickets";
import QuantityStepper from "@/components/atoms/QuantityStepper";
import { formatSingleDateTime } from "@abonten/core/dateFormatter";
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
  return (
    <div
      className={`border-2 rounded-md py-4 space-y-4 ${
        quantity > 0 ? "border-primary" : "border-border"
      }`}
    >
      <div className="flex items-center justify-between px-4">
        <p>{ticket.type}</p>

        <QuantityStepper
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
              {ticket.currency} {""}
              {discountedUnitPrice !== null ? (
                <span className="flex justify-center items-center gap-1">
                  {discountedUnitPrice} <MdDiscount className="text-lg" />
                </span>
              ) : (
                ticket.price
              )}
            </p>

            {quantity > 0 && hasAppliedPromo && eligibleUnits < quantity && (
              <p className="text-xs text-muted-foreground">
                Discount applies to {eligibleUnits} of {quantity}
              </p>
            )}
          </div>

          <p
            className={
              ticket.quantity === 0 ? "text-destructive font-bold" : ""
            }
          >
            {ticket.quantity === null
              ? "Unlimited"
              : ticket.quantity === 0
                ? "Sold out"
                : `Quantity left: ${ticket.quantity}`}
          </p>
        </div>

        {ticket.type !== "SINGLE TICKET" && ticket.available_until && (
          <p className="text-sm">
            Sales end on {formatSingleDateTime(ticket.available_until).date}
          </p>
        )}
      </div>
    </div>
  );
}
