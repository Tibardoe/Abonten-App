import { useToast } from "@abonten/ui-native";
import { useCallback } from "react";
import { type ShareOutcome, shareLink } from "./share";

/**
 * Share a link from a screen: opens the native share sheet and turns a
 * failure into a visible toast. Closing the sheet without sharing is a
 * normal outcome and stays silent.
 *
 * NOT for use straight after closing a <Sheet> — on iOS the share sheet is a
 * presented controller and cannot appear while the sheet's modal is still
 * dismissing (it silently never shows). Queue it with useModalHandoff and
 * call this from the sheet's onDismiss.
 */
export function useShareLink() {
  const toast = useToast();
  return useCallback(
    async (title: string, url: string | null): Promise<ShareOutcome> => {
      const outcome = await shareLink(title, url);
      if (outcome.kind === "failed") {
        toast.error("Couldn't share", { description: outcome.message });
      }
      return outcome;
    },
    [toast],
  );
}
