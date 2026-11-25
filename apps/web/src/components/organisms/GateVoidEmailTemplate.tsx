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
  /** The partner's name (a brand: Hapniin). */
  partner: string;
  /** The partner codes to void, as the partner issued them. */
  codes: string[];
  manageUrl: string;
}

/** Codes listed in the email itself; the rest are on the event's page. */
const MAX_LISTED = 200;

/**
 * To an organizer whose gate is run by a partner's check-in system
 * (docs/architecture/gate-partner-connectors.md): tickets sold on Abonten
 * were cancelled or refunded, and the partner cannot be told by API yet, so
 * these codes must be voided in the partner's system before the gate opens.
 */
export default function GateVoidEmailTemplate({
  words,
  eventTitle,
  partner,
  codes,
  manageUrl,
}: EmailTemplateProp) {
  const { t, locale, greeting } = words;
  const listed = codes.slice(0, MAX_LISTED);

  return (
    <EmailShell
      locale={locale}
      preview={t("gateVoid.preview", { count: codes.length, eventTitle })}
      heading={t("gateVoid.heading", { count: codes.length })}
      intro={
        <>
          <EmailIntro>
            {richEmailText(
              t("gateVoid.intro", {
                greeting,
                eventTitle,
                partner,
                count: codes.length,
              }),
              { strong: (chunk) => <strong>{chunk}</strong> },
            )}
          </EmailIntro>
          <EmailIntro spaced>{t("gateVoid.why", { partner })}</EmailIntro>
        </>
      }
    >
      <EmailDivider />
      <EmailSection>
        <EmailSectionLabel>
          {t("gateVoid.codesLabel", { partner })}
        </EmailSectionLabel>
        {listed.map((code, index) => (
          <EmailDetailRow
            key={code}
            label={t("gateVoid.codeNumber", { number: index + 1 })}
            value={code}
            mono
          />
        ))}
        {codes.length > listed.length ? (
          <EmailFinePrint>
            {t("gateVoid.more", { count: codes.length - listed.length })}
          </EmailFinePrint>
        ) : null}
      </EmailSection>

      <EmailButton href={manageUrl}>{t("gateVoid.button")}</EmailButton>

      <EmailFooter words={words}>
        <EmailFinePrint>{t("gateVoid.afterVoiding")}</EmailFinePrint>
      </EmailFooter>
    </EmailShell>
  );
}
