import { ABONTEN_PDF_LOGO_PATH } from "@/config/brandAssets";
import type { TicketPdfData } from "@abonten/core/ticketPdfData";
import {
  Document,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";

const styles = StyleSheet.create({
  page: {
    padding: 32,
    fontSize: 11,
    fontFamily: "Helvetica",
    color: "#1a1a1a",
  },
  logo: {
    width: 104,
    alignSelf: "center",
    marginBottom: 16,
  },
  heading: {
    fontSize: 24,
    fontFamily: "Helvetica-Bold",
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
    fontFamily: "Helvetica-Bold",
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
    fontFamily: "Helvetica-Bold",
  },
  statusActive: {
    fontFamily: "Helvetica-Bold",
    color: "#16a34a",
  },
  statusOther: {
    fontFamily: "Helvetica-Bold",
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

export default function TicketPdfDocument({
  ticket,
  images,
}: {
  ticket: TicketPdfData;
  images?: TicketPdfImages;
}) {
  const logo = images?.logo === undefined ? ABONTEN_PDF_LOGO_PATH : images.logo;
  const flyer =
    images?.flyer === undefined ? ticket.flyerImageUrl : images.flyer;
  const qr = images?.qr === undefined ? ticket.qrImageUrl : images.qr;

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {logo ? <Image src={logo} style={styles.logo} /> : null}

        <Text style={styles.heading}>Receipt</Text>
        <Text style={styles.issuedAt}>Issued on: {ticket.issuedAt}</Text>

        <View style={styles.card}>
          {flyer ? <Image src={flyer} style={styles.flyer} /> : null}

          <View style={styles.cardBody}>
            <Text style={styles.title}>{ticket.eventTitle}</Text>

            {ticket.attendeeName ? (
              <View style={styles.row}>
                <Text style={styles.label}>Attendee</Text>
                <Text style={styles.value}>{ticket.attendeeName}</Text>
              </View>
            ) : null}

            <View style={styles.row}>
              <Text style={styles.label}>Ticket Type</Text>
              <Text style={styles.value}>{ticket.ticketTypeName}</Text>
            </View>

            <View style={styles.row}>
              <Text style={styles.label}>Ticket Code</Text>
              <Text style={styles.value}>{ticket.ticketCode}</Text>
            </View>

            <View style={styles.row}>
              <Text style={styles.label}>Status</Text>
              <Text
                style={
                  ticket.status === "active" || ticket.status === "used"
                    ? styles.statusActive
                    : styles.statusOther
                }
              >
                {ticket.status === "used" ? "Checked in" : ticket.status}
              </Text>
            </View>

            <View style={styles.row}>
              <Text style={styles.label}>Location</Text>
              <Text style={styles.value}>{ticket.eventAddress}</Text>
            </View>

            <View style={styles.row}>
              <Text style={styles.label}>Date</Text>
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
