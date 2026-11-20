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

/** What moved: the date, the date and the venue, the venue, one date of several, or nothing yet (postponed). */
export type RescheduleEmailKind =
  | "date"
  | "date_venue"
  | "venue"
  | "one_date"
  | "postponed";

interface EmailTemplateProp {
  words: EmailWords;
  kind: RescheduleEmailKind;
  eventTitle: string;
  /** Dates already written in the reader's language and the event's zone. */
  previousWhen: string;
  /** Null while postponed. */
  newWhen: string | null;
  /** The new and the old venue, when the venue changed. */
  venue: string | null;
  previousVenue: string | null;
  /** Null while postponed (open until the new date is set). */
  refundUntil: string | null;
  /** The organizer's own words, shown as they wrote them. */
  message: string;
  myTicketsUrl: string;
}

const HEADING: Record<RescheduleEmailKind, string> = {
  date: "reschedule.heading",
  date_venue: "reschedule.heading",
  one_date: "reschedule.heading",
  venue: "reschedule.headingVenue",
  postponed: "reschedule.headingPostponed",
};

const INTRO: Record<RescheduleEmailKind, string> = {
  date: "reschedule.intro",
  date_venue: "reschedule.introDateVenue",
  one_date: "reschedule.introOneDate",
  venue: "reschedule.introVenue",
  postponed: "reschedule.introPostponed",
};

/**
 * "Your event has moved" (or "has a new venue", "is postponed") to every
 * holder of a moved event (docs/architecture/event-reschedule.md): what
 * changed, the organizer's message, and the choice — keep the ticket
 * (nothing to do) or give it back for a full refund until the window closes
 * (while postponed: until the new date is set). Written in the holder's
 * language; built from EmailParts like the cancellation email.
 */
export default function EventRescheduledEmailTemplate({
  words,
  kind,
  eventTitle,
  previousWhen,
  newWhen,
  venue,
  previousVenue,
  refundUntil,
  message,
  myTicketsUrl,
}: EmailTemplateProp) {
  const { t, locale, greeting } = words;
  const preview =
    kind === "postponed"
      ? t("reschedule.previewPostponed", { eventTitle })
      : kind === "venue"
        ? t("reschedule.previewVenue", { eventTitle, venue: venue ?? "" })
        : t("reschedule.preview", { eventTitle, newWhen: newWhen ?? "" });
  const choice =
    kind === "postponed" || !refundUntil
      ? t("reschedule.choicePostponed")
      : kind === "venue"
        ? t("reschedule.choiceVenue", { refundUntil })
        : t("reschedule.choice", { refundUntil });
  return (
    <EmailShell
      locale={locale}
      preview={preview}
      heading={t(HEADING[kind])}
      intro={
        <>
          <EmailIntro>
            {richEmailText(t(INTRO[kind], { greeting, eventTitle }), {
              strong: (chunk) => <strong>{chunk}</strong>,
            })}
          </EmailIntro>
          <EmailIntro spaced>{choice}</EmailIntro>
        </>
      }
    >
      <EmailDivider />
      <EmailSection>
        <EmailDetailRow label={t("reschedule.event")} value={eventTitle} />
        {kind === "venue" ? (
          <EmailDetailRow label={t("reschedule.when")} value={previousWhen} />
        ) : (
          <EmailDetailRow label={t("reschedule.was")} value={previousWhen} />
        )}
        {newWhen && kind !== "venue" && kind !== "postponed" ? (
          <EmailDetailRow label={t("reschedule.now")} value={newWhen} />
        ) : null}
        {venue ? (
          <EmailDetailRow label={t("reschedule.venue")} value={venue} />
        ) : null}
        {previousVenue ? (
          <EmailDetailRow
            label={t("reschedule.previousVenue")}
            value={previousVenue}
          />
        ) : null}
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
