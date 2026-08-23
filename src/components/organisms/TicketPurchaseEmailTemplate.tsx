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

export type EmailTicketLine = {
  ticketCode: string;
  ticketTypeName: string;
};

interface EmailTemplateProp {
  username: string | null;
  eventTitle: string;
  eventDate: string;
  eventTime: string;
  eventAddress: string;
  tickets: EmailTicketLine[];
  purchaseDate: string;
  amountLabel: string;
  myEventsUrl: string;
}

export default function TicketPurchaseEmailTemplate({
  username,
  eventTitle,
  eventDate,
  eventTime,
  eventAddress,
  tickets,
  purchaseDate,
  amountLabel,
  myEventsUrl,
}: EmailTemplateProp) {
  const quantity = tickets.length;

  return (
    <Html>
      <Head>
        {/* Lets mail clients (Apple Mail, Outlook, Gmail's app dark theme)
            know this email explicitly supports both schemes, instead of the
            client silently re-tinting the background around a logo that
            can't repaint itself. @react-email/tailwind (2.0.7) doesn't
            compile `dark:` variants to a real @media block — it just
            collapses to whichever class comes last — so the light/dark logo
            swap below is done with a plain hand-written style block instead. */}
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
            Your Abonten ticket for {eventTitle} is ready — see details inside
          </Preview>
          <Container className="my-[10px] mx-auto w-[600px] max-w-full border border-[#E5E5E5]">
            <Section className="py-10 px-[48px] text-center">
              {/* The logo is a flat raster image, so it can't react to dark
                  mode on its own — swap between a black-on-light and a
                  white-on-dark variant via the prefers-color-scheme rule
                  above instead. */}
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
                Congratulations! 🎟️
              </Heading>
              <Text className="m-0 text-[14px] leading-[2] text-[#747474] font-medium">
                Hi {username ?? "there"}, your ticket for{" "}
                <strong>{eventTitle}</strong> has been successfully purchased.
              </Text>
              <Text className="m-0 text-[14px] leading-[2] text-[#747474] font-medium mt-4">
                Your ticket is attached to this email as a PDF. You can also
                access it anytime from My Tickets in Abonten.
              </Text>
            </Section>

            <Hr className="border-[#E5E5E5] m-0" />

            <Section className="px-[48px] py-8">
              <Row>
                <Text className="text-[13px] font-bold text-[#747474] uppercase tracking-wide m-0 mb-3">
                  Ticket Details
                </Text>
              </Row>

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
                  <Text className="m-0 text-[13.5px] text-[#747474]">Date</Text>
                </Column>
                <Column className="td-value">
                  <Text className="m-0 text-[13.5px] font-bold text-black">
                    {eventDate}
                  </Text>
                </Column>
              </Row>

              <Row className="mb-2">
                <Column className="w-1/3 td-label">
                  <Text className="m-0 text-[13.5px] text-[#747474]">Time</Text>
                </Column>
                <Column className="td-value">
                  <Text className="m-0 text-[13.5px] font-bold text-black">
                    {eventTime}
                  </Text>
                </Column>
              </Row>

              <Row className="mb-2">
                <Column className="w-1/3 td-label">
                  <Text className="m-0 text-[13.5px] text-[#747474]">
                    Venue
                  </Text>
                </Column>
                <Column className="td-value">
                  <Text className="m-0 text-[13.5px] font-bold text-black">
                    {eventAddress}
                  </Text>
                </Column>
              </Row>

              <Row className="mb-2">
                <Column className="w-1/3 td-label">
                  <Text className="m-0 text-[13.5px] text-[#747474]">
                    Quantity
                  </Text>
                </Column>
                <Column className="td-value">
                  <Text className="m-0 text-[13.5px] font-bold text-black">
                    {quantity} {quantity === 1 ? "ticket" : "tickets"}
                  </Text>
                </Column>
              </Row>

              <Row className="mb-2">
                <Column className="w-1/3 td-label">
                  <Text className="m-0 text-[13.5px] text-[#747474]">
                    Purchase Date
                  </Text>
                </Column>
                <Column className="td-value">
                  <Text className="m-0 text-[13.5px] font-bold text-black">
                    {purchaseDate}
                  </Text>
                </Column>
              </Row>

              <Row className="mb-4">
                <Column className="w-1/3 td-label">
                  <Text className="m-0 text-[13.5px] text-[#747474]">
                    Amount Paid
                  </Text>
                </Column>
                <Column className="td-value">
                  <Text className="m-0 text-[13.5px] font-bold text-black">
                    {amountLabel}
                  </Text>
                </Column>
              </Row>

              {tickets.map((ticket) => (
                <Row key={ticket.ticketCode} className="mt-3">
                  <Column className="w-1/3 td-label">
                    <Text className="m-0 text-[13.5px] text-[#747474]">
                      {ticket.ticketTypeName}
                    </Text>
                  </Column>
                  <Column className="td-value">
                    <Text className="m-0 text-[13.5px] font-mono text-black">
                      {ticket.ticketCode}
                    </Text>
                  </Column>
                </Row>
              ))}
            </Section>

            <Hr className="border-[#E5E5E5] m-0" />

            <Section className="py-8 text-center">
              <Link
                href={myEventsUrl}
                className="bg-brand text-white font-bold text-[14px] rounded-[8px] px-8 py-3 inline-block"
              >
                View My Tickets
              </Link>
            </Section>

            <Hr className="border-[#E5E5E5] m-0" />

            <Section className="py-[22px]">
              <Row>
                <Text className="m-0 text-[#AFAFAF] text-[13px] text-center px-10">
                  Please keep your ticket safe — you&apos;ll need it (or the
                  attached PDF) for entry at the venue. If you have any
                  questions, contact us through the Abonten app.
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
