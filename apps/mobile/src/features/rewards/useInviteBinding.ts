import { useSession } from "@/auth/SessionProvider";
import { bindResultMessage } from "@abonten/core/rewards/invite";
import { useToast } from "@abonten/ui-native";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { bindPendingInvite, captureInstallReferrer } from "./inviteCapture";

/**
 * Applies a friend's invite this device holds once someone is signed in
 * (after sign-up, or on launch for an existing session), and reads the Play
 * install referrer once per install. Answers that need no attention
 * (already joined, invites off) stay quiet.
 */
export function useInviteBinding() {
  const { session } = useSession();
  const userId = session?.user.id ?? null;
  const toast = useToast();
  const toastRef = useRef(toast);
  toastRef.current = toast;
  const qc = useQueryClient();

  useEffect(() => {
    void captureInstallReferrer();
  }, []);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    (async () => {
      // The install referrer may land a moment after launch.
      await captureInstallReferrer();
      const outcome = await bindPendingInvite();
      if (!active || !outcome) return;
      if (
        outcome.result === "already_bound" ||
        outcome.result === "capture_off" ||
        outcome.result === "program_off" ||
        outcome.result === "error"
      ) {
        return;
      }
      const { tone, text } = bindResultMessage(outcome);
      if (tone === "success") {
        toastRef.current.success(text, { duration: 8000 });
        qc.invalidateQueries({ queryKey: ["mobile", "rewards"] });
      } else if (tone === "info") {
        toastRef.current.info(text);
      } else {
        toastRef.current.error(text);
      }
    })();
    return () => {
      active = false;
    };
  }, [userId, qc]);
}
