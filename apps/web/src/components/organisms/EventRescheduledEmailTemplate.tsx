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

interface EmailTemplateProp {
  words: EmailWords;
  eventTitle: string;
  /** Both already written in the reader's language and the event's zone. */
  previousWhen: string;
  newWhen: string;
  refundUntil: string;
  /** The organizer's own words, shown as they wrote them. */
  message: string;
  myTicketsUrl: string;
}

/**
 * "Your event has moved" to every holder of a moved event
 * (docs/architecture/event-reschedule.md): the old and new dates, the
 * organizer's message, and the choice — keep the ticket (nothing to do) or
 * give it back for a full refund until the window closes. Written in the
 * holder's language; built from EmailParts like the cancellation email.
 */
export default function EventRescheduledEmailTemplate({
  words,
  eventTitle,
  previousWhen,
  newWhen,
  refundUntil,
  message,
  myTicketsUrl,
}: EmailTemplateProp) {
  const { t, locale, greeting } = words;
  return (
    <EmailShell
      locale={locale}
      preview={t("reschedule.preview", { eventTitle, newWhen })}
      heading={t("reschedule.heading")}
      intro={
        <>
          <EmailIntro>
            {richEmailText(t("reschedule.intro", { greeting, eventTitle }), {
              strong: (chunk) => <strong>{chunk}</strong>,
            })}
          </EmailIntro>
          <EmailIntro spaced>
            {t("reschedule.choice", { refundUntil })}
          </EmailIntro>
        </>
      }
    >
      <EmailDivider />
      <EmailSection>
        <EmailDetailRow label={t("reschedule.event")} value={eventTitle} />
        <EmailDetailRow label={t("reschedule.was")} value={previousWhen} />
        <EmailDetailRow label={t("reschedule.now")} value={newWhen} />
      </EmailSection>
      <EmailSection>
        <EmailSectionLabel>{t("reschedule.messageLabel")}</EmailSectionLabel>
        <EmailIntro>{message}</EmailIntro>
      </EmailSection>

      <EmailButton href={myTicketsUrl}>
        {t("reschedule.openTickets")}
      </EmailButton>

      <EmailFooter words={words}>
        <EmailFinePrint>{t("reschedule.questions")}</EmailFinePrint>
      </EmailFooter>
    </EmailShell>
  );
}
