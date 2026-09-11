import {
  ABONTEN_LOGO_EMAIL_DARK_URL,
  ABONTEN_LOGO_EMAIL_LIGHT_URL,
} from "@/config/brandAssets";
import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Tailwind,
  Text,
  pixelBasedPreset,
} from "@react-email/components";

export type RewardUpdateEmailItem = { title: string; body: string | null };

interface RewardUpdateEmailProps {
  name: string | null;
  items: RewardUpdateEmailItem[];
  rewardsUrl: string;
}

/**
 * Abonten Rewards email: credit someone can use now (credit ready, welcome
 * credit, promotion credit). One email can carry several notices -- the
 * delivery queue batches a person's notices and sends at most one reward
 * email every 12 hours (sendRewardUpdateEmail.ts). The text is the same as
 * the in-app notification's, so the two never disagree. Styled like
 * EventCancellationEmailTemplate.tsx.
 */
export default function RewardUpdateEmailTemplate({
  name,
  items,
  rewardsUrl,
}: RewardUpdateEmailProps) {
  const heading = items.length === 1 ? items[0].title : "Your rewards update";
  return (
    <Html>
      <Head>
        <meta name="color-scheme" content="light dark" />
        <meta name="supported-color-schemes" content="light dark" />
        <style>
          {`.abonten-logo-dark{display:none}
            @media (prefers-color-scheme:dark){
              .abonten-logo-light{display:none!important}
              .abonten-logo-dark{display:block!important}
            }`}
        </style>
      </Head>
      <Tailwind
        config={{
          presets: [pixelBasedPreset],
          theme: { extend: { colors: { brand: "#007291" } } },
        }}
      >
        <Body className="bg-white font-sans">
          <Preview>{items[0]?.body ?? heading}</Preview>
          <Container className="my-[10px] mx-auto w-[600px] max-w-full border border-[#E5E5E5]">
            <Section className="py-10 px-[48px] text-center">
              <Img
                src={ABONTEN_LOGO_EMAIL_LIGHT_URL}
                width="120"
                alt="Abonten Hub"
                className="abonten-logo-light mx-auto mb-4"
                style={{ display: "block" }}
              />
              <Img
                src={ABONTEN_LOGO_EMAIL_DARK_URL}
                width="120"
                alt="Abonten Hub"
                className="abonten-logo-dark mx-auto mb-4"
                style={{ display: "none" }}
              />
              <Heading className="text-[28px] leading-[1.3] font-bold text-center -tracking-[1px]">
                {heading}
              </Heading>
              <Text className="m-0 text-[14px] leading-[2] text-[#747474] font-medium">
                Hi {name ?? "there"}, here&apos;s what&apos;s new with your
                Abonten Credit.
              </Text>
            </Section>

            <Hr className="border-[#E5E5E5] m-0" />

            <Section className="px-[48px] py-6">
              {items.map((item, i) => (
                <Section
                  // biome-ignore lint/suspicious/noArrayIndexKey: a static email list that never re-orders
                  key={i}
                  className={i > 0 ? "pt-4" : undefined}
                >
                  <Text className="m-0 text-[15px] font-bold text-black">
                    {item.title}
                  </Text>
                  {item.body ? (
                    <Text className="m-0 mt-1 text-[14px] leading-[1.6] text-[#555555]">
                      {item.body}
                    </Text>
                  ) : null}
                </Section>
              ))}
            </Section>

            <Hr className="border-[#E5E5E5] m-0" />

            <Section className="py-8 text-center">
              <Link
                href={rewardsUrl}
                className="bg-brand text-white font-bold text-[14px] rounded-[8px] px-8 py-3 inline-block"
              >
                Open Abonten Rewards
              </Link>
            </Section>

            <Hr className="border-[#E5E5E5] m-0" />

            <Section className="py-[22px]">
              <Text className="m-0 text-[#AFAFAF] text-[13px] text-center px-10">
                You&apos;re getting this because you earned Abonten Credit on
                your Abonten Hub account. Credit can be spent on Abonten and
                can&apos;t be exchanged for cash.
              </Text>
              <Text className="m-0 text-[#AFAFAF] text-[13px] text-center pt-4">
                © {new Date().getFullYear()} Abonten Hub. All Rights Reserved.
              </Text>
            </Section>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}
