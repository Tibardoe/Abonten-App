"use client";

import { bindReferralCode } from "@/actions/bindReferralCode";
import { supabase } from "@/config/supabase/client";
import { useToast } from "@/hooks/useToast";
import {
  INVITE_FLAG_COOKIE_NAME,
  bindResultMessage,
} from "@abonten/core/rewards/invite";
import { useEffect, useRef } from "react";

// Applies a friend's invite (an /invite/CODE link, or a code typed on the
// sign-in screen) once the visitor is signed in. The code itself stays in
// the signed httpOnly cookie; this only looks at the readable "there's an
// invite" flag, so nothing is sent to the server for anyone else.

// One attempt per page load (React dev mode mounts effects twice).
let attempted = false;

export default function InviteBinder() {
  const toast = useToast();
  // The toast context changes whenever a toast shows; keep this effect to
  // one run per page load.
  const toastRef = useRef(toast);
  toastRef.current = toast;

  useEffect(() => {
    const hasInvite = document.cookie
      .split("; ")
      .some((c) => c.startsWith(`${INVITE_FLAG_COOKIE_NAME}=`));
    if (!hasInvite || attempted) return;

    (async () => {
      // Signed out: the session lives in cookies, so this doesn't hit the
      // network. Try again on the next page load after sign-in.
      const { data } = await supabase.auth.getSession();
      if (!data.session || attempted) return;
      attempted = true;

      const res = await bindReferralCode().catch(() => null);
      if (!res?.data) return;
      const { result } = res.data;
      if (result === "already_bound" || result === "capture_off") return;
      if (result === "program_off" || result === "error") return;
      const { tone, text } = bindResultMessage(res.data);
      const show = toastRef.current;
      if (tone === "success") show.success(text, { durationMs: 8000 });
      else if (tone === "info") show.info(text);
      else show.error(text);
    })();
  }, []);

  return null;
}
