import { ABONTEN_LOGO_EMAIL_LIGHT_URL } from "@/config/brandAssets";
import type { TicketPdfData } from "@/utils/ticketPdfData";
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
    width: 90,
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

export default function TicketPdfDocument({
  ticket,
}: {
  ticket: TicketPdfData;
}) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Image src={ABONTEN_LOGO_EMAIL_LIGHT_URL} style={styles.logo} />

        <Text style={styles.heading}>Receipt</Text>
        <Text style={styles.issuedAt}>Issued on: {ticket.issuedAt}</Text>

        <View style={styles.card}>
          <Image src={ticket.flyerImageUrl} style={styles.flyer} />

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

            <View style={styles.qrWrap}>
              <Image src={ticket.qrImageUrl} style={styles.qr} />
            </View>

            <Text style={styles.footer}>www.abontenhub.com</Text>
          </View>
        </View>
      </Page>
    </Document>
  );
}
