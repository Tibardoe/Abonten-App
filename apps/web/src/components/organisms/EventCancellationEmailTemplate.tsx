import {
  EmailButton,
  EmailDetailRow,
  EmailDivider,
  EmailFinePrint,
  EmailFooter,
  EmailIntro,
  EmailSection,
  EmailShell,
} from "./EmailParts";

interface EmailTemplateProp {
  username: string | null;
  eventTitle: string;
  amountLabel: string;
  currency: string;
  myTicketsUrl: string;
}

/**
 * Cancellation email for a PAID ticket holder only -- free registrations are
 * covered by the in-app notification (and its push) alone (see
 * eventCancellationNotification.ts), since there's no refund to explain by
 * email. Never claims the refund is complete -- only that it's being
 * processed, matching the actual authoritative state (transaction.status
 * starts at 'refund_pending', not 'refunded', the moment this email is
 * sent). Built from EmailParts, which keeps it readable in Gmail, Outlook
 * and dark mode.
 */
export default function EventCancellationEmailTemplate({
  username,
  eventTitle,
  amountLabel,
  currency,
  myTicketsUrl,
}: EmailTemplateProp) {
  return (
    <EmailShell
      preview={`${eventTitle} has been cancelled — here's what happens to your ticket`}
      heading="Event cancelled"
      intro={
        <>
          <EmailIntro>
            Hi {username ?? "there"}, the organizer has cancelled{" "}
            <strong>{eventTitle}</strong>. Your ticket is no longer valid.
          </EmailIntro>
          <EmailIntro spaced>
            A refund will be issued to the payment method used for your ticket.
            This can take a few days to complete — you can check its status
            anytime from My Tickets.
          </EmailIntro>
        </>
      }
    >
      <EmailDivider />
      <EmailSection>
        <EmailDetailRow label="Event" value={eventTitle} />
        <EmailDetailRow
          label="Refund amount"
          value={`${currency} ${amountLabel}`}
        />
        <EmailDetailRow label="Refund status" value="Processing" />
      </EmailSection>

      <EmailButton href={myTicketsUrl}>View Refund Status</EmailButton>

      <EmailFooter>
        <EmailFinePrint>
          If you have any questions about this cancellation or your refund,
          contact us through the Abonten app.
        </EmailFinePrint>
      </EmailFooter>
    </EmailShell>
  );
}
