import { translatorFor } from "@/i18n/clientTranslator";
import { logger } from "@abonten/core/logger";
type ShareData = {
  title: string;
  url: string;
  /** Message shown with the link in the share sheet. */
  text?: string;
};

/**
 * Opens the native share sheet, or copies the link where there isn't one.
 * Returns how the link left the page, or null when nothing was shared
 * (dismissed / failed).
 */
export async function handleShare({
  title,
  url,
  text,
}: ShareData): Promise<"native" | "copy" | null> {
  const shareData = {
    title,
    text:
      text ?? translatorFor("common")("checkOutThisEvent", { title: title }),
    url,
  };

  if (navigator.share) {
    try {
      await navigator.share(shareData);
      return "native";
    } catch (err) {
      logger.error("Error sharing:", err);
      return null;
    }
  }

  try {
    await navigator.clipboard.writeText(url);
    alert(translatorFor("common")("linkCopiedToClipboard"));
    return "copy";
  } catch (err) {
    logger.error("Clipboard copy failed:", err);
    return null;
  }
}
