import { checkedInTicketLines } from "@abonten/core/openAmountTickets";
import type { CheckedInTicket } from "@abonten/services/tickets/checkInTicketCore";
import { useLocale, useTranslations } from "next-intl";

/**
 * What the door shows after a ticket is checked in: its type and note, and
 * for a ticket whose amount the buyer chose the amount paid in large type
 * ("Paid GH₵150"), so staff load that many credits
 * (docs/architecture/open-amount-tickets.md). The words are
 * checkedInTicketLines, the same the app's scanner shows (unit-tested in
 * @abonten/core).
 */
export default function CheckedInTicketPanel({
  ticket,
}: {
  ticket: CheckedInTicket;
}) {
  const locale = useLocale();
  const tc = useTranslations("core");
  const lines = checkedInTicketLines(tc, ticket, locale);

  return (
    <div className="space-y-1">
      {lines.paid ? (
        <p className="text-3xl font-bold tracking-tight text-foreground">
          {lines.paid}
        </p>
      ) : null}
      {lines.type ? (
        <p className="text-sm font-semibold text-foreground">{lines.type}</p>
      ) : null}
      {lines.note ? (
        <p className="text-sm text-muted-foreground">{lines.note}</p>
      ) : null}
    </div>
  );
}
