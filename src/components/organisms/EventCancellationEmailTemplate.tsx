import {
  ABONTEN_LOGO_EMAIL_DARK_URL,
  ABONTEN_LOGO_EMAIL_LIGHT_URL,
} from "@/config/brandAssets";
import {
  Body,
  Column,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Row,
  Section,
  Tailwind,
  Text,
  pixelBasedPreset,
} from "@react-email/components";

interface EmailTemplateProp {
  username: string | null;
  eventTitle: string;
  amountLabel: string;
  currency: string;
  myTicketsUrl: string;
}

/**
 * Cancellation email for a PAID ticket holder only -- free registrations are
 * covered by the in-app notification alone (see eventCancellationNotification.ts),
 * since there's no refund to explain by email. Mirrors
 * TicketPurchaseEmailTemplate.tsx's structure/brand styling, minus the PDF
 * attachment and ticket-code table this doesn't need. Never claims the
 * refund is complete -- only that it's being processed, matching the actual
 * authoritative state (transaction.status starts at 'refund_pending', not
 * 'refunded', the moment this email is sent).
 */
export default function EventCancellationEmailTemplate({
  username,
  eventTitle,
  amountLabel,
  currency,
  myTicketsUrl,
}: EmailTemplateProp) {
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
            }
            @media (max-width:480px){
              .td-label,.td-value{display:block!important;width:100%!important;text-align:left!important}
              .td-value{margin-top:2px!important}
            }`}
        </style>
      </Head>
      <Tailwind
        config={{
          presets: [pixelBasedPreset],
          theme: {
            extend: {
              colors: {
                brand: "#007291",
              },
            },
          },
        }}
      >
        <Body className="bg-white font-sans">
          <Preview>
            {eventTitle} has been cancelled — here's what happens to your ticket
          </Preview>
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
                Event cancelled
              </Heading>
              <Text className="m-0 text-[14px] leading-[2] text-[#747474] font-medium">
                Hi {username ?? "there"}, the organizer has cancelled{" "}
                <strong>{eventTitle}</strong>. Your ticket is no longer valid.
              </Text>
              <Text className="m-0 text-[14px] leading-[2] text-[#747474] font-medium mt-4">
                A refund will be issued to the payment method used for your
                ticket. This can take a few days to complete — you can check the
                current status anytime from My Tickets.
              </Text>
            </Section>

            <Hr className="border-[#E5E5E5] m-0" />

            <Section className="px-[48px] py-8">
              <Row className="mb-2">
                <Column className="w-1/3 td-label">
                  <Text className="m-0 text-[13.5px] text-[#747474]">
                    Event
                  </Text>
                </Column>
                <Column className="td-value">
                  <Text className="m-0 text-[13.5px] font-bold text-black">
                    {eventTitle}
                  </Text>
                </Column>
              </Row>

              <Row className="mb-2">
                <Column className="w-1/3 td-label">
                  <Text className="m-0 text-[13.5px] text-[#747474]">
                    Refund amount
                  </Text>
                </Column>
                <Column className="td-value">
                  <Text className="m-0 text-[13.5px] font-bold text-black">
                    {currency} {amountLabel}
                  </Text>
                </Column>
              </Row>

              <Row>
                <Column className="w-1/3 td-label">
                  <Text className="m-0 text-[13.5px] text-[#747474]">
                    Refund status
                  </Text>
                </Column>
                <Column className="td-value">
                  <Text className="m-0 text-[13.5px] font-bold text-black">
                    Processing
                  </Text>
                </Column>
              </Row>
            </Section>

            <Hr className="border-[#E5E5E5] m-0" />

            <Section className="py-8 text-center">
              <Link
                href={myTicketsUrl}
                className="bg-brand text-white font-bold text-[14px] rounded-[8px] px-8 py-3 inline-block"
              >
                View Refund Status
              </Link>
            </Section>

            <Hr className="border-[#E5E5E5] m-0" />

            <Section className="py-[22px]">
              <Row>
                <Text className="m-0 text-[#AFAFAF] text-[13px] text-center px-10">
                  If you have any questions about this cancellation or your
                  refund, contact us through the Abonten app.
                </Text>
              </Row>
              <Row>
                <Text className="m-0 text-[#AFAFAF] text-[13px] text-center pt-4">
                  © {new Date().getFullYear()} Abonten Hub. All Rights Reserved.
                </Text>
              </Row>
            </Section>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}
