import { translatorFor } from "@/i18n/clientTranslator";
import { logger } from "@abonten/core/logger";
type ShareData = {
  title: string;
  url: string;
  /** Message shown with the link in the share sheet. */
  text?: string;
};

/**
 * How the link left the page: through the share sheet, or copied; or that
 * it did not: the person closed the sheet, or neither way worked.
 */
export type ShareOutcome = "native" | "copy" | "dismissed" | "failed";

/**
 * Opens the native share sheet, or copies the link where there isn't one
 * (or where the sheet would not open). Says what happened and shows
 * nothing itself: the caller tells the person (hooks/useEventShare.ts).
 */
export async function handleShare({
  title,
  url,
  text,
}: ShareData): Promise<ShareOutcome> {
  const shareData = {
    title,
    text:
      text ?? translatorFor("common")("checkOutThisEvent", { title: title }),
    url,
  };

  if (typeof navigator.share === "function") {
    try {
      await navigator.share(shareData);
      return "native";
    } catch (err) {
      // Closing the share sheet rejects with AbortError: a choice, not a
      // failure, and not something to copy a link behind their back for.
      if (err instanceof DOMException && err.name === "AbortError") {
        return "dismissed";
      }
      logger.error("Error sharing:", err);
    }
  }

  try {
    await navigator.clipboard.writeText(url);
    return "copy";
  } catch (err) {
    logger.error("Clipboard copy failed:", err);
    return "failed";
  }
}
