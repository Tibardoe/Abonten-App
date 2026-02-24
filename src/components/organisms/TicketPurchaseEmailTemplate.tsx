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
import tailwindConfig from "../../../tailwind.config";

const logoUrl = "/assets/images/abonte-logo-white.svg";

interface EmailTemplateProp {
  username: string;
}

export default function TicketPurchaseEmailTemplate({
  username,
}: EmailTemplateProp) {
  return (
    <Html>
      <Head />
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
        <Body className="bg-white font-nike">
          <Preview>
            Your Abonten event ticket is ready — see details inside
          </Preview>
          <Container className="my-[10px] mx-auto w-[600px] max-w-full border border-[#E5E5E5]">
            <Section className="py-10 px-[74px] text-center">
              <Img
                src={`${logoUrl}/static/nike-logo.png`}
                width="66"
                height="22"
                alt="Nike"
                className="mx-auto"
              />
              <Heading className="text-[32px] leading-[1.3] font-bold text-center -tracking-[1px]">
                Your Ticket Is Ready 🎟️
              </Heading>
              <Text className="m-0 text-[14px] leading-[2] text-[#747474] font-medium">
                Hi {username}, your ticket purchase was successful.
              </Text>
              <Text className="m-0 text-[14px] leading-[2] text-[#747474] font-medium mt-6">
                Your official event ticket is attached to this email as a PDF.
                Please keep it safe — you’ll need it for entry at the venue.
              </Text>
            </Section>

            <Hr className="border-[#E5E5E5] m-0" />

            <Section className="px-5 pt-5 bg-[#F7F7F7]">
              <Row>
                <Text className="px-5 font-bold">Get Help</Text>
              </Row>
              <Row className="py-[22px] px-5">
                <Column className="w-1/3" colSpan={1}>
                  <Link
                    href="https://www.nike.com/"
                    className="text-[13.5px] mt-0 font-medium text-black"
                  >
                    Shipping Status
                  </Link>
                </Column>
                <Column className="w-1/3" colSpan={1}>
                  <Link
                    href="https://www.nike.com/"
                    className="text-[13.5px] mt-0 font-medium text-black"
                  >
                    Shipping & Delivery
                  </Link>
                </Column>
                <Column className="w-1/3" colSpan={1}>
                  <Link
                    href="https://www.nike.com/"
                    className="text-[13.5px] mt-0 font-medium text-black"
                  >
                    Returns & Exchanges
                  </Link>
                </Column>
              </Row>
              <Row className="pb-[22px] px-5 pt-0">
                <Column className="w-1/3" colSpan={1}>
                  <Link
                    href="https://www.nike.com/"
                    className="text-[13.5px] mt-0 font-medium text-black"
                  >
                    How to Return
                  </Link>
                </Column>
                <Column className="w-2/3" colSpan={2}>
                  <Link
                    href="https://www.nike.com/"
                    className="text-[13.5px] mt-0 font-medium text-black"
                  >
                    Contact Options
                  </Link>
                </Column>
              </Row>
              <Hr className="border-[#E5E5E5] m-0" />
              <Row className="px-5 pt-8 pb-[22px]">
                <Column>
                  <Row>
                    <Column className="w-4">
                      <Img
                        src={`${logoUrl}/static/nike-phone.png`}
                        alt="Nike Phone"
                        width="16px"
                        height="26px"
                        className="pr-[14px]"
                      />
                    </Column>
                    <Column>
                      <Text className="text-[13.5px] mt-0 font-medium text-black mb-0">
                        1-800-806-6453
                      </Text>
                    </Column>
                  </Row>
                </Column>
                <Column>
                  <Text className="text-[13.5px] mt-0 font-medium text-black mb-0">
                    4 am - 11 pm PT
                  </Text>
                </Column>
              </Row>
            </Section>
            <Hr className="border-[#E5E5E5] m-0" />
            <Section className="py-[22px]">
              <Row>
                <Text className="text-[32px] leading-[1.3] font-bold text-center -tracking-[1px]">
                  Nike.com
                </Text>
              </Row>
              <Row className="w-[370px] mx-auto pt-3">
                <Column align="center">
                  <Link
                    href="https://www.nike.com/"
                    className="font-medium text-black"
                  >
                    Men
                  </Link>
                </Column>
                <Column align="center">
                  <Link
                    href="https://www.nike.com/"
                    className="font-medium text-black"
                  >
                    Women
                  </Link>
                </Column>
                <Column align="center">
                  <Link
                    href="https://www.nike.com/"
                    className="font-medium text-black"
                  >
                    Kids
                  </Link>
                </Column>
                <Column align="center">
                  <Link
                    href="https://www.nike.com/"
                    className="font-medium text-black"
                  >
                    Customize
                  </Link>
                </Column>
              </Row>
            </Section>
            <Hr className="border-[#E5E5E5] m-0 mt-3" />
            <Section className="py-[22px]">
              <Row className="w-[166px] mx-auto">
                <Column>
                  <Text className="m-0 text-[#AFAFAF] text-[13px] text-center">
                    Web Version
                  </Text>
                </Column>
                <Column>
                  <Text className="m-0 text-[#AFAFAF] text-[13px] text-center">
                    Privacy Policy
                  </Text>
                </Column>
              </Row>
              <Row>
                <Text className="m-0 text-[#AFAFAF] text-[13px] text-center py-[30px]">
                  Please contact us if you have any questions. (If you reply to
                  this email, we won&apos;t be able to see it.)
                </Text>
              </Row>
              <Row>
                <Text className="m-0 text-[#AFAFAF] text-[13px] text-center">
                  © 2022 Nike, Inc. All Rights Reserved.
                </Text>
              </Row>
              <Row>
                <Text className="m-0 text-[#AFAFAF] text-[13px] text-center">
                  NIKE, INC. One Bowerman Drive, Beaverton, Oregon 97005, USA.
                </Text>
              </Row>
            </Section>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}
