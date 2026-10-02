import type { EmailWords } from "@/lib/email/emailWords";
import { richEmailText } from "@/lib/email/emailWords";
import { Column, Img, Link, Row, Section, Text } from "@react-email/components";
import {
  EmailButton,
  EmailDivider,
  EmailFinePrint,
  EmailFooter,
  EmailIntro,
  EmailSection,
  EmailShell,
  emailFinePrintLink,
  emailText,
} from "./EmailParts";

export type RecommendationDigestEmailItem = {
  title: string;
  /** "Sat 20 Sep, 7:30pm" or the place category. */
  detail: string | null;
  /** Why it's here: "From @organizer", "Similar to events you enjoyed". */
  reason: string;
  imageUrl: string | null;
  href: string;
};

interface RecommendationDigestEmailProps {
  words: EmailWords;
  headline: string;
  items: RecommendationDigestEmailItem[];
  forYouUrl: string;
  settingsUrl: string;
  unsubscribeUrl: string;
}

/**
 * The recommendation digest by email: the same picks as the push, for people
 * who switched these emails on themselves (legal item G1 gates the switch),
 * in their language. Every pick says why it is there, and the footer says
 * why the email came and how to stop it (plus List-Unsubscribe headers from
 * the sender). Built from EmailParts like the other Abonten emails.
 */
export default function RecommendationDigestEmailTemplate({
  words,
  headline,
  items,
  forYouUrl,
  settingsUrl,
  unsubscribeUrl,
}: RecommendationDigestEmailProps) {
  const { t, locale, greeting } = words;
  return (
    <EmailShell
      locale={locale}
      preview={items.map((i) => i.title).join(" · ")}
      heading={headline}
      intro={
        <EmailIntro>
          {t("digest.intro", { greeting, count: items.length })}
        </EmailIntro>
      }
    >
      <EmailDivider />
      <EmailSection>
        {items.map((item, i) => (
          <Section
            key={item.href}
            style={i > 0 ? { paddingTop: "18px" } : undefined}
          >
            <Row>
              {item.imageUrl ? (
                <Column style={{ width: "72px", verticalAlign: "top" }}>
                  <Link href={item.href}>
                    <Img
                      src={item.imageUrl}
                      alt=""
                      width="64"
                      height="64"
                      style={{ borderRadius: "8px", objectFit: "cover" }}
                    />
                  </Link>
                </Column>
              ) : null}
              <Column style={{ verticalAlign: "top" }}>
                <Link
                  href={item.href}
                  style={{
                    ...emailText,
                    fontSize: "16px",
                    fontWeight: 700,
                    color: "#111111",
                    textDecoration: "none",
                  }}
                >
                  {item.title}
                </Link>
                {item.detail ? (
                  <Text style={{ ...emailText, margin: "2px 0 0" }}>
                    {item.detail}
                  </Text>
                ) : null}
                <Text
                  style={{
                    ...emailText,
                    margin: "2px 0 0",
                    fontSize: "13px",
                    color: "#6b7280",
                  }}
                >
                  {item.reason}
                </Text>
              </Column>
            </Row>
          </Section>
        ))}
      </EmailSection>

      <EmailButton href={forYouUrl}>{t("digest.seeAll")}</EmailButton>

      <EmailFooter words={words}>
        <EmailFinePrint>{t("digest.why")}</EmailFinePrint>
        <EmailFinePrint>
          {richEmailText(t("digest.unsubscribe"), {
            unsubscribe: (chunk) => (
              <Link href={unsubscribeUrl} style={emailFinePrintLink}>
                {chunk}
              </Link>
            ),
            settings: (chunk) => (
              <Link href={settingsUrl} style={emailFinePrintLink}>
                {chunk}
              </Link>
            ),
          })}
        </EmailFinePrint>
      </EmailFooter>
    </EmailShell>
  );
}
