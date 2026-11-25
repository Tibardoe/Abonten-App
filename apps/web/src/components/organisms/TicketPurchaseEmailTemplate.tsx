import type { EmailWords } from "@/lib/email/emailWords";
import { richEmailText } from "@/lib/email/emailWords";
import {
  EmailButton,
  EmailDetailRow,
  EmailDivider,
  EmailFinePrint,
  EmailFollowAbonten,
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
  /**
   * A partner gate checks these tickets in: who scans them, or that their
   * codes are on their way (docs/architecture/gate-partner-connectors.md).
   */
  gate?: "partner" | "partner_pending" | null;
  /** Sent again because the partner's codes have arrived. */
  codesReady?: boolean;
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
  gate = null,
  codesReady = false,
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
      preview={
        codesReady
          ? t("ticket.gateCodesReadyPreview", { eventTitle })
          : t("ticket.preview", { eventTitle })
      }
      heading={
        codesReady ? t("ticket.gateCodesReadyHeading") : t("ticket.heading")
      }
      intro={
        <>
          <EmailIntro>
            {richEmailText(
              codesReady
                ? t("ticket.gateCodesReadyIntro", { greeting, eventTitle })
                : t("ticket.intro", { greeting, eventTitle }),
              {
                strong: (chunk) => <strong>{chunk}</strong>,
              },
            )}
          </EmailIntro>
          <EmailIntro spaced>{t("ticket.attached")}</EmailIntro>
          {gate === "partner" ? (
            <EmailIntro spaced>{t("ticket.gateScannedBy")}</EmailIntro>
          ) : null}
          {gate === "partner_pending" ? (
            <EmailIntro spaced>{t("ticket.gateCodeOnItsWayBody")}</EmailIntro>
          ) : null}
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
        {tickets.map((ticket, index) => (
          <EmailDetailRow
            // A partner code still on its way reads the same on every line.
            key={`${index}-${ticket.ticketCode}`}
            label={ticket.ticketTypeName}
            value={ticket.ticketCode}
            mono
          />
        ))}
      </EmailSection>

      <EmailButton href={myEventsUrl}>{t("ticket.viewMyTickets")}</EmailButton>

      <EmailFollowAbonten words={words} />

      <EmailFooter words={words}>
        <EmailFinePrint>{t("ticket.keepSafe")}</EmailFinePrint>
      </EmailFooter>
    </EmailShell>
  );
}
