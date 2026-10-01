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
  EmailShell,
} from "./EmailParts";

interface EmailTemplateProp {
  words: EmailWords;
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
 * sent). Written in the ticket holder's language. Built from EmailParts,
 * which keeps it readable in Gmail, Outlook and dark mode.
 */
export default function EventCancellationEmailTemplate({
  words,
  eventTitle,
  amountLabel,
  myTicketsUrl,
}: EmailTemplateProp) {
  const { t, locale, greeting } = words;
  return (
    <EmailShell
      locale={locale}
      preview={t("cancellation.preview", { eventTitle })}
      heading={t("cancellation.heading")}
      intro={
        <>
          <EmailIntro>
            {richEmailText(t("cancellation.intro", { greeting, eventTitle }), {
              strong: (chunk) => <strong>{chunk}</strong>,
            })}
          </EmailIntro>
          <EmailIntro spaced>{t("cancellation.refund")}</EmailIntro>
        </>
      }
    >
      <EmailDivider />
      <EmailSection>
        <EmailDetailRow label={t("cancellation.event")} value={eventTitle} />
        <EmailDetailRow
          label={t("cancellation.refundAmount")}
          value={amountLabel}
        />
        <EmailDetailRow
          label={t("cancellation.refundStatus")}
          value={t("cancellation.processing")}
        />
      </EmailSection>

      <EmailButton href={myTicketsUrl}>
        {t("cancellation.viewRefundStatus")}
      </EmailButton>

      <EmailFooter words={words}>
        <EmailFinePrint>{t("cancellation.questions")}</EmailFinePrint>
      </EmailFooter>
    </EmailShell>
  );
}
