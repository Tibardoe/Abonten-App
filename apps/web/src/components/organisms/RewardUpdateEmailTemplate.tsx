import type { EmailWords } from "@/lib/email/emailWords";
import { richEmailText } from "@/lib/email/emailWords";
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
  words: EmailWords;
  items: RewardUpdateEmailItem[];
  rewardsUrl: string;
  unsubscribeUrl: string;
}

/**
 * Abonten Rewards email: credit someone can use now (credit ready, welcome
 * credit, promotion credit). One email can carry several notices -- the
 * delivery queue batches a person's notices and sends at most one reward
 * email every 12 hours (sendRewardUpdateEmail.ts). The items are the in-app
 * notices, already worded in the person's language, so the two never
 * disagree. Every reward email has an unsubscribe link (and List-Unsubscribe
 * headers, added by the sender). Built from EmailParts, which keeps it
 * readable in Gmail, Outlook and dark mode.
 */
export default function RewardUpdateEmailTemplate({
  words,
  items,
  rewardsUrl,
  unsubscribeUrl,
}: RewardUpdateEmailProps) {
  const { t, locale, greeting } = words;
  const heading =
    items.length === 1 ? items[0].title : t("rewards.headingMany");
  return (
    <EmailShell
      locale={locale}
      preview={items[0]?.body ?? heading}
      heading={heading}
      intro={<EmailIntro>{t("rewards.intro", { greeting })}</EmailIntro>}
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

      <EmailButton href={rewardsUrl}>{t("rewards.open")}</EmailButton>

      <EmailFooter words={words}>
        <EmailFinePrint>{t("rewards.why")}</EmailFinePrint>
        <EmailFinePrint>
          {richEmailText(t("rewards.unsubscribe"), {
            link: (chunk) => (
              <Link href={unsubscribeUrl} style={emailFinePrintLink}>
                {chunk}
              </Link>
            ),
          })}
        </EmailFinePrint>
      </EmailFooter>
    </EmailShell>
  );
}
