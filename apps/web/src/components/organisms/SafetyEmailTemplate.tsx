import { emailWords } from "@/lib/email/emailWords";
import { Text } from "@react-email/components";
import {
  EmailButton,
  EmailFinePrint,
  EmailFooter,
  EmailIntro,
  EmailSection,
  EmailShell,
  emailText,
} from "./EmailParts";

// Abonten Safety emails to a trusted contact: an alert, a missed check-in, a
// shared location, "is safe", "was a mistake", or the invite. Every word is
// written by @abonten/services/safety (in the CONTACT's language) and arrives
// ready; this only lays it out.
export default function SafetyEmailTemplate({
  locale,
  heading,
  intro,
  buttonLabel,
  buttonUrl,
  lines,
  footer,
}: {
  locale: string;
  heading: string;
  intro: string;
  buttonLabel: string;
  buttonUrl: string;
  lines: string[];
  footer: string;
}) {
  return (
    <EmailShell
      locale={locale}
      preview={heading}
      heading={heading}
      intro={<EmailIntro>{intro}</EmailIntro>}
    >
      <EmailButton href={buttonUrl}>{buttonLabel}</EmailButton>
      {lines.length > 0 ? (
        <EmailSection>
          {lines.map((line) => (
            <Text
              key={line}
              style={{ ...emailText, textAlign: "center", margin: "0 0 10px" }}
            >
              {line}
            </Text>
          ))}
        </EmailSection>
      ) : null}
      <EmailFooter words={emailWords(locale, null)}>
        <EmailFinePrint>{footer}</EmailFinePrint>
      </EmailFooter>
    </EmailShell>
  );
}
