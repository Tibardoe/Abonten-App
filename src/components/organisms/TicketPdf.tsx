// @/components/pdf/TicketPdfTemplate.tsx
import type { UserTicketType } from "@/types/ticketType";
import {
  Document,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";

const styles = StyleSheet.create({
  page: { padding: 30, backgroundColor: "#ffffff" },
  header: { textAlign: "center", marginBottom: 20 },
  title: { fontSize: 24, fontWeight: "bold" },
  flyer: { width: "100%", height: 200, marginBottom: 15, borderRadius: 10 },
  qrCode: { width: 150, height: 150, alignSelf: "center", marginTop: 20 },
  details: { marginBottom: 10 },
  label: { fontSize: 10, color: "#666" },
  value: { fontSize: 14, marginBottom: 5 },
});

export function TicketPdfTemplate({ event }: { event: UserTicketType }) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.title}>Receipt</Text>
          <Text style={styles.label}>Issued on: {event.issued_at}</Text>
        </View>

        <Image
          src={`https://res.cloudinary.com/abonten/image/upload/v${event.event.flyer_version}/${event.event.flyer_public_id}.jpg`}
          style={styles.flyer}
        />

        <View style={styles.details}>
          <Text style={styles.label}>Event</Text>
          <Text style={styles.value}>{event.event.title}</Text>

          <Text style={styles.label}>Ticket Code</Text>
          <Text style={styles.value}>{event.ticket_code}</Text>

          <Text style={styles.label}>Location</Text>
          <Text style={styles.value}>{event.event.address.full_address}</Text>
        </View>

        <Image
          src={`https://res.cloudinary.com/abonten/image/upload/v${event.qr_version}/${event.qr_public_id}.jpg`}
          style={styles.qrCode}
        />
      </Page>
    </Document>
  );
}
