import type { EmailWords } from "@/lib/email/emailWords";
import { richEmailText } from "@/lib/email/emailWords";
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
  words: EmailWords;
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
 * ticketPurchaseNotification.ts), in the buyer's language. Built from
 * EmailParts, which keeps it readable in Gmail, Outlook and dark mode.
 */
export default function TicketPurchaseEmailTemplate({
  words,
  eventTitle,
  eventDate,
  eventTime,
  eventAddress,
  tickets,
  purchaseDate,
  amountLabel,
  myEventsUrl,
}: EmailTemplateProp) {
  const { t, locale, greeting } = words;
  const quantity = tickets.length;

  return (
    <EmailShell
      locale={locale}
      preview={t("ticket.preview", { eventTitle })}
      heading={t("ticket.heading")}
      intro={
        <>
          <EmailIntro>
            {richEmailText(t("ticket.intro", { greeting, eventTitle }), {
              strong: (chunk) => <strong>{chunk}</strong>,
            })}
          </EmailIntro>
          <EmailIntro spaced>{t("ticket.attached")}</EmailIntro>
        </>
      }
    >
      <EmailDivider />
      <EmailSection>
        <EmailSectionLabel>{t("ticket.detailsLabel")}</EmailSectionLabel>
        <EmailDetailRow label={t("ticket.event")} value={eventTitle} />
        <EmailDetailRow label={t("ticket.date")} value={eventDate} />
        <EmailDetailRow label={t("ticket.time")} value={eventTime} />
        <EmailDetailRow label={t("ticket.venue")} value={eventAddress} />
        <EmailDetailRow
          label={t("ticket.quantity")}
          value={t("ticket.quantityValue", { count: quantity })}
        />
        <EmailDetailRow label={t("ticket.purchaseDate")} value={purchaseDate} />
        <EmailDetailRow label={t("ticket.amountPaid")} value={amountLabel} />
        {tickets.map((ticket) => (
          <EmailDetailRow
            key={ticket.ticketCode}
            label={ticket.ticketTypeName}
            value={ticket.ticketCode}
            mono
          />
        ))}
      </EmailSection>

      <EmailButton href={myEventsUrl}>{t("ticket.viewMyTickets")}</EmailButton>

      <EmailFooter words={words}>
        <EmailFinePrint>{t("ticket.keepSafe")}</EmailFinePrint>
      </EmailFooter>
    </EmailShell>
  );
}
