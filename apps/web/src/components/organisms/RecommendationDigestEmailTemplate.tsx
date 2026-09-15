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
  name: string | null;
  headline: string;
  items: RecommendationDigestEmailItem[];
  forYouUrl: string;
  settingsUrl: string;
  unsubscribeUrl: string;
}

/**
 * The recommendation digest by email: the same picks as the push, for people
 * who switched these emails on themselves (legal item G1 gates the switch).
 * Every pick says why it is there, and the footer says why the email came
 * and how to stop it (plus List-Unsubscribe headers from the sender). Built
 * from EmailParts like the other Abonten emails.
 */
export default function RecommendationDigestEmailTemplate({
  name,
  headline,
  items,
  forYouUrl,
  settingsUrl,
  unsubscribeUrl,
}: RecommendationDigestEmailProps) {
  return (
    <EmailShell
      preview={items.map((i) => i.title).join(" · ")}
      heading={headline}
      intro={
        <EmailIntro>
          Hi {name ?? "there"}, here {items.length === 1 ? "is" : "are"}{" "}
          {items.length === 1 ? "a pick" : `${items.length} picks`} based on
          what you asked to hear about.
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

      <EmailButton href={forYouUrl}>See all your picks</EmailButton>

      <EmailFooter>
        <EmailFinePrint>
          You&apos;re getting this because you turned on emails about picks and
          alerts in your Abonten Hub notification settings. At most one a day.
        </EmailFinePrint>
        <EmailFinePrint>
          Don&apos;t want these emails?{" "}
          <Link href={unsubscribeUrl} style={emailFinePrintLink}>
            Unsubscribe
          </Link>{" "}
          or{" "}
          <Link href={settingsUrl} style={emailFinePrintLink}>
            change your settings
          </Link>
          . Tickets, payments and account emails aren&apos;t affected.
        </EmailFinePrint>
      </EmailFooter>
    </EmailShell>
  );
}
