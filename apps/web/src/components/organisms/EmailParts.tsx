import { ABONTEN_LOGO_EMAIL_TILE_URL } from "@/config/brandAssets";
import { LEGAL_ENTITY_NAME } from "@abonten/core/brand/legalEntity";
import {
  Body,
  Button,
  Column,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Preview,
  Row,
  Section,
  Text,
} from "@react-email/components";
import type { ReactNode } from "react";

/**
 * Building blocks shared by every Abonten email (ticket purchase, event
 * cancellation, Abonten Rewards), written for the awkward mail clients and
 * checked against caniemail with doiuse-email:
 * - Plain inline styles, no `<style>` block, class selectors, media queries
 *   or `display:none` swaps -- Gmail's mobile web client and Outlook for
 *   Windows drop them (the old templates showed two logos there and lost
 *   their mobile layout).
 * - A Helvetica / Arial font stack: Outlook for Windows (Word's renderer)
 *   falls back to Times New Roman when the first font isn't installed, which
 *   is what Tailwind's `ui-sans-serif` stack did.
 * - react-email's <Button>, which carries Outlook's padding workaround (a
 *   styled link loses its padding there and looks like plain text).
 * - The logo on its own white tile, so it stays readable when Gmail's or
 *   Outlook's app darkens the email in dark mode.
 * - Label / value rows are a fixed two-column table that simply wraps on a
 *   phone, instead of a media query that stacks them.
 */

export const EMAIL_FONT = "Helvetica, Arial, sans-serif";
export const EMAIL_MONO = "'Courier New', Courier, monospace";
export const EMAIL_BRAND = "#007291";
const INK = "#111111";
const BODY = "#444444";
const MUTED = "#6b6b6b";
const FAINT = "#737373";
const RULE = "#e5e5e5";

export const emailText = {
  fontFamily: EMAIL_FONT,
  fontSize: "15px",
  lineHeight: "22px",
  color: BODY,
  margin: 0,
} as const;

/** Html + Body + the bordered 600px card, with the logo and heading on top. */
export function EmailShell({
  preview,
  heading,
  intro,
  children,
}: {
  preview: string;
  heading: string;
  intro: ReactNode;
  children: ReactNode;
}) {
  return (
    <Html lang="en">
      <Head>
        <meta name="color-scheme" content="light dark" />
        <meta name="supported-color-schemes" content="light dark" />
      </Head>
      <Preview>{preview}</Preview>
      <Body
        style={{
          backgroundColor: "#ffffff",
          fontFamily: EMAIL_FONT,
          margin: 0,
        }}
      >
        <Container
          style={{
            width: "100%",
            maxWidth: "600px",
            margin: "10px auto",
            border: `1px solid ${RULE}`,
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
                fontFamily: EMAIL_FONT,
                fontSize: "26px",
                lineHeight: "32px",
                fontWeight: 700,
                color: INK,
                margin: "0 0 8px",
              }}
            >
              {heading}
            </Heading>
            {intro}
          </Section>
          {children}
        </Container>
      </Body>
    </Html>
  );
}

/** A centred paragraph under the heading. */
export function EmailIntro({
  children,
  spaced = false,
}: {
  children: ReactNode;
  spaced?: boolean;
}) {
  return (
    <Text
      style={{
        ...emailText,
        color: MUTED,
        margin: spaced ? "12px 0 0" : 0,
      }}
    >
      {children}
    </Text>
  );
}

export function EmailDivider() {
  return <Hr style={{ borderColor: RULE, margin: 0 }} />;
}

export function EmailSection({ children }: { children: ReactNode }) {
  return <Section style={{ padding: "24px 32px" }}>{children}</Section>;
}

export function EmailSectionLabel({ children }: { children: ReactNode }) {
  return (
    <Text
      style={{
        ...emailText,
        fontSize: "12px",
        lineHeight: "16px",
        fontWeight: 700,
        color: MUTED,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        margin: "0 0 12px",
      }}
    >
      {children}
    </Text>
  );
}

/** One label / value line in a details list. */
export function EmailDetailRow({
  label,
  value,
  mono = false,
}: {
  label: ReactNode;
  value: ReactNode;
  mono?: boolean;
}) {
  return (
    <Row>
      <Column
        width="38%"
        style={{ width: "38%", verticalAlign: "top", padding: "0 12px 8px 0" }}
      >
        <Text style={{ ...emailText, fontSize: "14px", color: MUTED }}>
          {label}
        </Text>
      </Column>
      <Column style={{ verticalAlign: "top", padding: "0 0 8px" }}>
        <Text
          style={{
            ...emailText,
            fontSize: "14px",
            fontWeight: mono ? 400 : 700,
            fontFamily: mono ? EMAIL_MONO : EMAIL_FONT,
            color: INK,
          }}
        >
          {value}
        </Text>
      </Column>
    </Row>
  );
}

/** The one call to action, centred. */
export function EmailButton({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <Section style={{ padding: "4px 32px 32px", textAlign: "center" }}>
      <Button
        href={href}
        style={{
          backgroundColor: EMAIL_BRAND,
          color: "#ffffff",
          fontFamily: EMAIL_FONT,
          fontSize: "15px",
          fontWeight: 700,
          lineHeight: "20px",
          borderRadius: "8px",
          padding: "13px 28px",
          textDecoration: "none",
        }}
      >
        {children}
      </Button>
    </Section>
  );
}

/** Small print under a divider; every paragraph is centred. */
export function EmailFooter({ children }: { children: ReactNode }) {
  return (
    <>
      <EmailDivider />
      <Section style={{ padding: "20px 32px 24px", textAlign: "center" }}>
        {children}
        <EmailFinePrint>
          © {new Date().getFullYear()} {LEGAL_ENTITY_NAME}
        </EmailFinePrint>
      </Section>
    </>
  );
}

export function EmailFinePrint({ children }: { children: ReactNode }) {
  return (
    <Text
      style={{
        ...emailText,
        fontSize: "13px",
        lineHeight: "19px",
        color: FAINT,
        margin: "0 0 12px",
      }}
    >
      {children}
    </Text>
  );
}

export const emailFinePrintLink = {
  color: FAINT,
  textDecoration: "underline",
} as const;
