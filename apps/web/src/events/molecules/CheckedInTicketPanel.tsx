import { formatMoney } from "@abonten/core/formatMoney";
import { ticketTypeLabel } from "@abonten/core/ticketTiers";
import type { CheckedInTicket } from "@abonten/services/tickets/checkInTicketCore";
import { useLocale, useTranslations } from "next-intl";

/**
 * What the door shows after a ticket is checked in: its type and note, and
 * for a ticket whose amount the buyer chose the amount paid in large type
 * ("Paid GH₵150"), so staff load that many credits
 * (docs/architecture/open-amount-tickets.md).
 */
export default function CheckedInTicketPanel({
  ticket,
}: {
  ticket: CheckedInTicket;
}) {
  const locale = useLocale();
  const tc = useTranslations("core");
  const tt = useTranslations("tickets");

  return (
    <div className="space-y-1">
      {ticket.paidAmount ? (
        <p className="text-3xl font-bold tracking-tight text-foreground">
          {tt("paidAtDoor", {
            amount: formatMoney(
              ticket.paidAmount.currency,
              ticket.paidAmount.amount,
              { locale },
            ),
          })}
        </p>
      ) : null}
      {ticket.type ? (
        <p className="text-sm font-semibold text-foreground">
          {ticketTypeLabel(tc, ticket.type)}
        </p>
      ) : null}
      {ticket.note ? (
        <p className="text-sm text-muted-foreground">{ticket.note}</p>
      ) : null}
    </div>
  );
}
