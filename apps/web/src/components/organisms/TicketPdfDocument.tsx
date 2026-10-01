import { ABONTEN_PDF_LOGO_PATH } from "@/config/brandAssets";
import {
  TICKET_PDF_FALLBACK_FONT,
  type TicketPdfFont,
} from "@/utils/ticketPdfFont";
import type {
  TicketPdfData,
  TicketPdfLabels,
} from "@abonten/core/ticketPdfData";
import {
  Document,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";

// One stylesheet per font: the receipt font when it loaded, the PDF's
// built-in Helvetica when it did not (see utils/ticketPdfFont.ts).
const stylesByFont = new Map<string, ReturnType<typeof makeStyles>>();

function stylesFor(font: TicketPdfFont) {
  let styles = stylesByFont.get(font.regular);
  if (!styles) {
    styles = makeStyles(font);
    stylesByFont.set(font.regular, styles);
  }
  return styles;
}

const makeStyles = (font: TicketPdfFont) =>
  StyleSheet.create({
    page: {
      padding: 32,
      fontSize: 11,
      fontFamily: font.regular,
      color: "#1a1a1a",
    },
    logo: {
      width: 104,
      alignSelf: "center",
      marginBottom: 16,
    },
    heading: {
      fontSize: 24,
      fontFamily: font.bold,
      textAlign: "center",
      marginBottom: 4,
    },
    issuedAt: {
      fontSize: 10,
      color: "#6b7280",
      textAlign: "center",
      marginBottom: 20,
    },
    card: {
      border: "1pt solid #E5E5E5",
      borderRadius: 8,
      overflow: "hidden",
    },
    flyer: {
      width: "100%",
      height: 180,
      objectFit: "cover",
    },
    cardBody: {
      padding: 16,
    },
    title: {
      fontSize: 16,
      fontFamily: font.bold,
      marginBottom: 10,
    },
    row: {
      flexDirection: "row",
      justifyContent: "space-between",
      marginBottom: 6,
    },
    label: {
      color: "#6b7280",
    },
    value: {
      fontFamily: font.bold,
    },
    statusActive: {
      fontFamily: font.bold,
      color: "#16a34a",
    },
    statusOther: {
      fontFamily: font.bold,
      color: "#dc2626",
    },
    qrWrap: {
      marginTop: 16,
      alignItems: "center",
    },
    qr: {
      width: 160,
      height: 160,
    },
    footer: {
      marginTop: 16,
      fontSize: 9,
      color: "#6b7280",
      textAlign: "right",
    },
  });

/** An image already fetched on the server (react-pdf reads PNG and JPEG). */
export type PdfImageData = { data: Buffer; format: "png" | "jpg" };

/**
 * Pre-fetched images for the server render. Omitted: the document fetches
 * the URL itself (the browser download). `null`: the image could not be
 * loaded and is left out — react-pdf would otherwise log "Attempt to access
 * memory outside buffer bounds" on the empty body and draw nothing anyway.
 */
export type TicketPdfImages = {
  logo?: PdfImageData | null;
  flyer?: PdfImageData | null;
  qr?: PdfImageData | null;
};

/**
 * The canonical ticket PDF. It takes its words as `labels`
 * (ticketPdfLabels) instead of reading a translator itself: @react-pdf
 * renders this tree with its own reconciler, outside the page's NextIntl
 * provider, so a hook here has no language to read.
 */
export default function TicketPdfDocument({
  ticket,
  labels,
  images,
  font = TICKET_PDF_FALLBACK_FONT,
}: {
  ticket: TicketPdfData;
  labels: TicketPdfLabels;
  images?: TicketPdfImages;
  /** The registered receipt font; Helvetica when it could not load. */
  font?: TicketPdfFont;
}) {
  const styles = stylesFor(font);
  const logo = images?.logo === undefined ? ABONTEN_PDF_LOGO_PATH : images.logo;
  const flyer =
    images?.flyer === undefined ? ticket.flyerImageUrl : images.flyer;
  const qr = images?.qr === undefined ? ticket.qrImageUrl : images.qr;

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {logo ? <Image src={logo} style={styles.logo} /> : null}

        <Text style={styles.heading}>{labels.title}</Text>
        <Text style={styles.issuedAt}>{labels.issuedOn}</Text>

        <View style={styles.card}>
          {flyer ? <Image src={flyer} style={styles.flyer} /> : null}

          <View style={styles.cardBody}>
            <Text style={styles.title}>{ticket.eventTitle}</Text>

            {ticket.attendeeName ? (
              <View style={styles.row}>
                <Text style={styles.label}>{labels.attendee}</Text>
                <Text style={styles.value}>{ticket.attendeeName}</Text>
              </View>
            ) : null}

            <View style={styles.row}>
              <Text style={styles.label}>{labels.ticketType}</Text>
              <Text style={styles.value}>{ticket.ticketTypeName}</Text>
            </View>

            <View style={styles.row}>
              <Text style={styles.label}>{labels.ticketCode}</Text>
              <Text style={styles.value}>{ticket.ticketCode}</Text>
            </View>

            <View style={styles.row}>
              <Text style={styles.label}>{labels.status}</Text>
              <Text
                style={
                  ticket.status === "active" || ticket.status === "used"
                    ? styles.statusActive
                    : styles.statusOther
                }
              >
                {labels.statusValue}
              </Text>
            </View>

            <View style={styles.row}>
              <Text style={styles.label}>{labels.location}</Text>
              <Text style={styles.value}>{ticket.eventAddress}</Text>
            </View>

            <View style={styles.row}>
              <Text style={styles.label}>{labels.date}</Text>
              <Text style={styles.value}>
                {ticket.eventDate} {ticket.eventTime}
              </Text>
            </View>

            {qr ? (
              <View style={styles.qrWrap}>
                <Image src={qr} style={styles.qr} />
              </View>
            ) : null}

            <Text style={styles.footer}>www.abontenhub.com</Text>
          </View>
        </View>
      </Page>
    </Document>
  );
}
