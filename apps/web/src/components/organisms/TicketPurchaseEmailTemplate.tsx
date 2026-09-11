import {
  EmailButton,
  EmailDetailRow,
  EmailDivider,
  EmailFinePrint,
  EmailFooter,
  EmailIntro,
  EmailSection,
  EmailSectionLabel,
  EmailShell,
} from "./EmailParts";

export type EmailTicketLine = {
  ticketCode: string;
  ticketTypeName: string;
};

interface EmailTemplateProp {
  username: string | null;
  eventTitle: string;
  eventDate: string;
  eventTime: string;
  eventAddress: string;
  tickets: EmailTicketLine[];
  purchaseDate: string;
  amountLabel: string;
  myEventsUrl: string;
}

/**
 * Purchase confirmation (the ticket PDFs are attached by
 * ticketPurchaseNotification.ts). Built from EmailParts, which keeps it
 * readable in Gmail, Outlook and dark mode.
 */
export default function TicketPurchaseEmailTemplate({
  username,
  eventTitle,
  eventDate,
  eventTime,
  eventAddress,
  tickets,
  purchaseDate,
  amountLabel,
  myEventsUrl,
}: EmailTemplateProp) {
  const quantity = tickets.length;

  return (
    <EmailShell
      preview={`Your Abonten ticket for ${eventTitle} is ready — see details inside`}
      heading="Congratulations! 🎟️"
      intro={
        <>
          <EmailIntro>
            Hi {username ?? "there"}, your ticket for{" "}
            <strong>{eventTitle}</strong> has been successfully purchased.
          </EmailIntro>
          <EmailIntro spaced>
            Your ticket is attached to this email as a PDF. You can also open it
            anytime from My Tickets in Abonten.
          </EmailIntro>
        </>
      }
    >
      <EmailDivider />
      <EmailSection>
        <EmailSectionLabel>Ticket details</EmailSectionLabel>
        <EmailDetailRow label="Event" value={eventTitle} />
        <EmailDetailRow label="Date" value={eventDate} />
        <EmailDetailRow label="Time" value={eventTime} />
        <EmailDetailRow label="Venue" value={eventAddress} />
        <EmailDetailRow
          label="Quantity"
          value={`${quantity} ${quantity === 1 ? "ticket" : "tickets"}`}
        />
        <EmailDetailRow label="Purchase date" value={purchaseDate} />
        <EmailDetailRow label="Amount paid" value={amountLabel} />
        {tickets.map((ticket) => (
          <EmailDetailRow
            key={ticket.ticketCode}
            label={ticket.ticketTypeName}
            value={ticket.ticketCode}
            mono
          />
        ))}
      </EmailSection>

      <EmailButton href={myEventsUrl}>View My Tickets</EmailButton>

      <EmailFooter>
        <EmailFinePrint>
          Please keep your ticket safe — you&apos;ll need it (or the attached
          PDF) for entry at the venue. If you have any questions, contact us
          through the Abonten app.
        </EmailFinePrint>
      </EmailFooter>
    </EmailShell>
  );
}
