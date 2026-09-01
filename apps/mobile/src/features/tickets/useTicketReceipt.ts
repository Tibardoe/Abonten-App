import {
  buildTicketPdfData,
  buildTicketPdfFilename,
} from "@abonten/core/ticketPdfData";
import type { UserTicketType } from "@abonten/types/ticketType";
import { File, Paths } from "expo-file-system";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { useState } from "react";
import { Alert } from "react-native";
import { buildTicketReceiptHtml } from "./ticketReceiptHtml";

/**
 * Native echo of the web `TicketModal` "Download As PDF" button. Renders the
 * shared `TicketPdfData` through an HTML mirror of `TicketPdfDocument`,
 * prints it to a PDF named like the web download
 * (`Abonten-Ticket-<code>.pdf`), then hands it to the OS share sheet
 * (Save to Files, WhatsApp, …).
 */
export function useTicketReceipt() {
  const [isGenerating, setIsGenerating] = useState(false);

  async function downloadReceipt(ticket: UserTicketType) {
    if (isGenerating) return;
    setIsGenerating(true);

    try {
      const data = buildTicketPdfData(ticket);
      const { uri } = await Print.printToFileAsync({
        html: buildTicketReceiptHtml(data),
      });

      // `printToFileAsync` writes to a random cache path; copy it to the same
      // filename the web download uses so the saved/shared file is
      // recognisable. Non-fatal if it fails — share the original then.
      let shareUri = uri;
      try {
        const named = new File(
          Paths.cache,
          buildTicketPdfFilename(data.ticketCode),
        );
        if (named.exists) named.delete();
        await new File(uri).copy(named);
        shareUri = named.uri;
      } catch {
        shareUri = uri;
      }

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(shareUri, {
          mimeType: "application/pdf",
          UTI: "com.adobe.pdf",
          dialogTitle: "Abonten ticket receipt",
        });
      } else {
        Alert.alert(
          "Receipt ready",
          "Sharing isn't available on this device, but the receipt PDF was generated.",
        );
      }
    } catch {
      Alert.alert(
        "Couldn't create the receipt",
        "Something went wrong generating the PDF. Please try again.",
      );
    } finally {
      setIsGenerating(false);
    }
  }

  return { downloadReceipt, isGenerating };
}
