import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { PUBLIC_SITE_ORIGIN } from "@abonten/core/brand/socialLinks";
import {
  HTTP_TIMEOUTS,
  fetchWithTimeout,
} from "@abonten/core/http/fetchWithTimeout";
import { logger } from "@abonten/core/logger";
import QRCode from "qrcode";

// What every share image is drawn with: the font, the Abonten mark and
// wordmark, the listing's picture and a QR code. Loaded once per server
// instance; a listing picture is fetched for each image.

/**
 * A file under public/: from disk when this deployment has it (local,
 * self-hosted), else from the site, where it is a static asset (Vercel
 * functions do not carry public/). Same approach as the ticket PDF.
 */
async function loadPublicFile(path: string): Promise<Buffer> {
  try {
    return await readFile(join(process.cwd(), "public", path));
  } catch {
    const res = await fetchWithTimeout(`${PUBLIC_SITE_ORIGIN}${path}`, {
      timeoutMs: HTTP_TIMEOUTS.cloudinary,
    });
    if (!res.ok) throw new Error(`share asset ${path}: ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }
}

export type ShareFont = {
  name: string;
  data: ArrayBuffer;
  weight: 400 | 700;
  style: "normal";
};

export type ShareAssets = {
  fonts: ShareFont[];
  /** The A mark, light on dark, as a data URI. */
  mark: string;
  /** The "Abonten" wordmark, light on dark, as a data URI. */
  wordmark: string;
};

/** The family name the layouts use. */
export const SHARE_FONT = "AbontenSans";

function toArrayBuffer(buffer: Buffer): ArrayBuffer {
  return buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  ) as ArrayBuffer;
}

function svgDataUri(svg: Buffer): string {
  return `data:image/svg+xml;base64,${svg.toString("base64")}`;
}

let assets: Promise<ShareAssets> | null = null;

/**
 * The font is the receipt's Noto Sans subset (public/fonts/receipt, SIL
 * Open Font License): it has the letters of Ghanaian languages (ɔ, ɛ) and
 * the cedi sign, which the brand's web font files (WOFF2) cannot give the
 * renderer. A failure is not remembered: the next image tries again.
 */
export function loadShareAssets(): Promise<ShareAssets> {
  if (!assets) {
    assets = Promise.all([
      loadPublicFile("/fonts/receipt/receipt-Regular.ttf"),
      loadPublicFile("/fonts/receipt/receipt-Bold.ttf"),
      loadPublicFile("/assets/images/brand/abonten-mark-night.svg"),
      loadPublicFile("/assets/images/brand/abonten-wordmark-night.svg"),
    ])
      .then(([regular, bold, mark, wordmark]) => ({
        fonts: [
          {
            name: SHARE_FONT,
            data: toArrayBuffer(regular),
            weight: 400 as const,
            style: "normal" as const,
          },
          {
            name: SHARE_FONT,
            data: toArrayBuffer(bold),
            weight: 700 as const,
            style: "normal" as const,
          },
        ],
        mark: svgDataUri(mark),
        wordmark: svgDataUri(wordmark),
      }))
      .catch((error) => {
        assets = null;
        throw error;
      });
  }
  return assets;
}

/**
 * A listing's picture as a data URI, or null when there is none or it
 * could not be fetched in time: the layouts draw without it rather than
 * fail the whole image.
 */
export async function loadPictureDataUri(
  url: string | null,
): Promise<string | null> {
  if (!url) return null;
  try {
    const res = await fetchWithTimeout(url, {
      timeoutMs: HTTP_TIMEOUTS.cloudinary,
    });
    if (!res.ok) return null;
    const type = res.headers.get("content-type") ?? "image/jpeg";
    if (!/^image\/(jpeg|png)/.test(type)) return null;
    const bytes = Buffer.from(await res.arrayBuffer());
    return `data:${type.split(";")[0]};base64,${bytes.toString("base64")}`;
  } catch (error) {
    logger.warn("Share image: picture unavailable", {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/** A QR code for the listing's public page, dark on white. */
export function qrDataUri(url: string): Promise<string> {
  return QRCode.toDataURL(url, {
    margin: 1,
    width: 360,
    errorCorrectionLevel: "M",
    color: { dark: "#0F120F", light: "#FFFFFF" },
  });
}
