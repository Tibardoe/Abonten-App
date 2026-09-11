import { ABONTEN_LOGO_EMAIL_TILE_URL } from "@/config/brandAssets";
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";

export type RewardUpdateEmailItem = { title: string; body: string | null };

interface RewardUpdateEmailProps {
  name: string | null;
  items: RewardUpdateEmailItem[];
  rewardsUrl: string;
  unsubscribeUrl: string;
}

/**
 * Abonten Rewards email: credit someone can use now (credit ready, welcome
 * credit, promotion credit). One email can carry several notices -- the
 * delivery queue batches a person's notices and sends at most one reward
 * email every 12 hours (sendRewardUpdateEmail.ts). The text is the same as
 * the in-app notification's, so the two never disagree.
 *
 * Written for the awkward clients, with plain inline styles rather than
 * Tailwind classes:
 * - Outlook for Windows (Word's renderer) ignores padding on links and
 *   falls back to Times New Roman when the first font isn't installed, so
 *   the button is react-email's <Button> (Outlook padding workaround) and
 *   the font stack starts with Helvetica / Arial.
 * - No `<style>` block, class selectors or `display:none` swaps: Gmail's
 *   mobile web client and Outlook for Windows drop them (checked against
 *   caniemail with doiuse-email). The logo sits on its own white tile, so
 *   it stays readable when a client darkens the email in dark mode.
 * - Every reward email has an unsubscribe link (and List-Unsubscribe
 *   headers, added by the sender).
 */
const FONT = "Helvetica, Arial, sans-serif";
const MUTED = "#6b6b6b";
const FAINT = "#737373";

export default function RewardUpdateEmailTemplate({
  name,
  items,
  rewardsUrl,
  unsubscribeUrl,
}: RewardUpdateEmailProps) {
  const heading = items.length === 1 ? items[0].title : "Your rewards update";
  return (
    <Html lang="en">
      <Head>
        <meta name="color-scheme" content="light dark" />
        <meta name="supported-color-schemes" content="light dark" />
      </Head>
      <Preview>{items[0]?.body ?? heading}</Preview>
      <Body style={{ backgroundColor: "#ffffff", fontFamily: FONT, margin: 0 }}>
        <Container
          style={{
            width: "100%",
            maxWidth: "600px",
            margin: "10px auto",
            border: "1px solid #e5e5e5",
          }}
        >
          <Section style={{ padding: "36px 32px 28px", textAlign: "center" }}>
            <Img
              src={ABONTEN_LOGO_EMAIL_TILE_URL}
              width="96"
              alt="Abonten Hub"
              style={{ display: "block", margin: "0 auto 12px" }}
            />
            <Heading
              as="h1"
              style={{
                fontFamily: FONT,
                fontSize: "26px",
                lineHeight: "32px",
                fontWeight: 700,
                color: "#111111",
                margin: "0 0 8px",
              }}
            >
              {heading}
            </Heading>
            <Text
              style={{
                fontFamily: FONT,
                fontSize: "15px",
                lineHeight: "22px",
                color: MUTED,
                margin: 0,
              }}
            >
              Hi {name ?? "there"}, here&apos;s what&apos;s new with your
              Abonten Credit.
            </Text>
          </Section>

          <Hr style={{ borderColor: "#e5e5e5", margin: 0 }} />

          <Section style={{ padding: "24px 32px" }}>
            {items.map((item, i) => (
              <Section
                // biome-ignore lint/suspicious/noArrayIndexKey: a static email list that never re-orders
                key={i}
                style={i > 0 ? { paddingTop: "18px" } : undefined}
              >
                <Text
                  style={{
                    fontFamily: FONT,
                    fontSize: "16px",
                    lineHeight: "22px",
                    fontWeight: 700,
                    color: "#111111",
                    margin: 0,
                  }}
                >
                  {item.title}
                </Text>
                {item.body ? (
                  <Text
                    style={{
                      fontFamily: FONT,
                      fontSize: "15px",
                      lineHeight: "22px",
                      color: "#444444",
                      margin: "4px 0 0",
                    }}
                  >
                    {item.body}
                  </Text>
                ) : null}
              </Section>
            ))}
          </Section>

          <Section style={{ padding: "4px 32px 32px", textAlign: "center" }}>
            <Button
              href={rewardsUrl}
              style={{
                backgroundColor: "#007291",
                color: "#ffffff",
                fontFamily: FONT,
                fontSize: "15px",
                fontWeight: 700,
                lineHeight: "20px",
                borderRadius: "8px",
                padding: "13px 28px",
                textDecoration: "none",
              }}
            >
              Open Abonten Rewards
            </Button>
          </Section>

          <Hr style={{ borderColor: "#e5e5e5", margin: 0 }} />

          <Section style={{ padding: "20px 32px 24px", textAlign: "center" }}>
            <Text
              style={{
                fontFamily: FONT,
                fontSize: "13px",
                lineHeight: "19px",
                color: FAINT,
                margin: 0,
              }}
            >
              You&apos;re getting this because you earned Abonten Credit on your
              Abonten Hub account. Credit can be spent on Abonten and can&apos;t
              be exchanged for cash.
            </Text>
            <Text
              style={{
                fontFamily: FONT,
                fontSize: "13px",
                lineHeight: "19px",
                color: FAINT,
                margin: "12px 0 0",
              }}
            >
              Don&apos;t want these emails?{" "}
              <Link
                href={unsubscribeUrl}
                style={{ color: FAINT, textDecoration: "underline" }}
              >
                Unsubscribe
              </Link>
              . You&apos;ll still see your credit in the app.
            </Text>
            <Text
              style={{
                fontFamily: FONT,
                fontSize: "13px",
                lineHeight: "19px",
                color: FAINT,
                margin: "12px 0 0",
              }}
            >
              © {new Date().getFullYear()} Abonten Hub
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
