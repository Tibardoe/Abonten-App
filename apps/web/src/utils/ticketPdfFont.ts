import { Font } from "@react-pdf/renderer";

// The font the ticket receipt is drawn in.
//
// A PDF's built-in Helvetica only has Western European letters: "Kɔtɔkɔ"
// came out as "KTtTkT" and an attendee called Ɔsei lost the first letter of
// their name. The receipt is therefore drawn in a subset of Noto Sans (SIL
// Open Font License, public/fonts/receipt/OFL.txt) that has the letters of
// Akan, Ewe, Ga, Yoruba, Igbo and Hausa, every accented Latin letter, and
// the currency signs (₵ ₦ €). When the font cannot be loaded the receipt is
// still made, in Helvetica: a ticket with a mangled letter still gets
// someone through the door, and no ticket at all does not.

export type TicketPdfFont = { regular: string; bold: string };

/** The PDF's built-in font: the fallback when the receipt font is missing. */
export const TICKET_PDF_FALLBACK_FONT: TicketPdfFont = {
  regular: "Helvetica",
  bold: "Helvetica-Bold",
};

const RECEIPT_FONT: TicketPdfFont = {
  regular: "AbontenReceipt",
  bold: "AbontenReceipt-Bold",
};

/** Where the two font files are served from (public/fonts/receipt). */
export const TICKET_PDF_FONT_PATHS = {
  regular: "/fonts/receipt/receipt-Regular.ttf",
  bold: "/fonts/receipt/receipt-Bold.ttf",
} as const;

function toBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== "undefined")
    return Buffer.from(bytes).toString("base64");
  let binary = "";
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) {
    binary += String.fromCharCode(...bytes.subarray(i, i + step));
  }
  return btoa(binary);
}

let registered = false;

/**
 * Registers the receipt font from its bytes (the caller fetched them: from
 * disk or the site on the server, from the site in the browser) and returns
 * the family names to draw with.
 */
export function registerTicketPdfFont(files: {
  regular: Uint8Array;
  bold: Uint8Array;
}): TicketPdfFont {
  if (!registered) {
    Font.register({
      family: RECEIPT_FONT.regular,
      src: `data:font/ttf;base64,${toBase64(files.regular)}`,
    });
    Font.register({
      family: RECEIPT_FONT.bold,
      src: `data:font/ttf;base64,${toBase64(files.bold)}`,
    });
    // The library breaks long words with English hyphenation rules, which
    // are wrong for every other language and for names: never split a word.
    Font.registerHyphenationCallback((word) => [word]);
    registered = true;
  }
  return RECEIPT_FONT;
}

let browserFont: Promise<TicketPdfFont> | null = null;

/**
 * The receipt font for a PDF built in the browser (the "Download as PDF"
 * button). Fetched once per page; a failed fetch falls back to Helvetica
 * for this download and is tried again on the next one.
 */
export function loadTicketPdfFontInBrowser(): Promise<TicketPdfFont> {
  if (!browserFont) {
    browserFont = (async () => {
      const [regular, bold] = await Promise.all(
        [TICKET_PDF_FONT_PATHS.regular, TICKET_PDF_FONT_PATHS.bold].map(
          async (path) => {
            const res = await fetch(path);
            if (!res.ok) throw new Error(`font ${path}: ${res.status}`);
            return new Uint8Array(await res.arrayBuffer());
          },
        ),
      );
      return registerTicketPdfFont({ regular, bold });
    })().catch(() => {
      browserFont = null;
      return TICKET_PDF_FALLBACK_FONT;
    });
  }
  return browserFont;
}
