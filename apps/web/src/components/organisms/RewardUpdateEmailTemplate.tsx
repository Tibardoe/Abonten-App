import { Link, Section, Text } from "@react-email/components";
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
 * the in-app notification's, so the two never disagree. Every reward email
 * has an unsubscribe link (and List-Unsubscribe headers, added by the
 * sender). Built from EmailParts, which keeps it readable in Gmail, Outlook
 * and dark mode.
 */
export default function RewardUpdateEmailTemplate({
  name,
  items,
  rewardsUrl,
  unsubscribeUrl,
}: RewardUpdateEmailProps) {
  const heading = items.length === 1 ? items[0].title : "Your rewards update";
  return (
    <EmailShell
      preview={items[0]?.body ?? heading}
      heading={heading}
      intro={
        <EmailIntro>
          Hi {name ?? "there"}, here&apos;s what&apos;s new with your Abonten
          Credit.
        </EmailIntro>
      }
    >
      <EmailDivider />
      <EmailSection>
        {items.map((item, i) => (
          <Section
            // biome-ignore lint/suspicious/noArrayIndexKey: a static email list that never re-orders
            key={i}
            style={i > 0 ? { paddingTop: "18px" } : undefined}
          >
            <Text
              style={{
                ...emailText,
                fontSize: "16px",
                fontWeight: 700,
                color: "#111111",
              }}
            >
              {item.title}
            </Text>
            {item.body ? (
              <Text style={{ ...emailText, margin: "4px 0 0" }}>
                {item.body}
              </Text>
            ) : null}
          </Section>
        ))}
      </EmailSection>

      <EmailButton href={rewardsUrl}>Open Abonten Rewards</EmailButton>

      <EmailFooter>
        <EmailFinePrint>
          You&apos;re getting this because you earned Abonten Credit on your
          Abonten Hub account. Credit can be spent on Abonten and can&apos;t be
          exchanged for cash.
        </EmailFinePrint>
        <EmailFinePrint>
          Don&apos;t want these emails?{" "}
          <Link href={unsubscribeUrl} style={emailFinePrintLink}>
            Unsubscribe
          </Link>
          . You&apos;ll still see your credit in the app.
        </EmailFinePrint>
      </EmailFooter>
    </EmailShell>
  );
}
