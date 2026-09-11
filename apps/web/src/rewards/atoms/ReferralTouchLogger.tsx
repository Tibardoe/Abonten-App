"use client";

import { recordReferralTouch } from "@/actions/recordReferralTouch";
import { normalizeReferralCode } from "@abonten/core/rewards/referralCode";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

// Logs a visit through a referral link (?ref=CODE) once per page per
// browser session. The attribution itself was already saved in a signed
// cookie by proxy.ts before the page rendered; this is only the click log.
// Reads window.location instead of useSearchParams so pages stay static.
export default function ReferralTouchLogger() {
  const pathname = usePathname();

  useEffect(() => {
    const code = normalizeReferralCode(
      new URLSearchParams(window.location.search).get("ref"),
    );
    if (!code) return;

    const key = `abn-ref-logged:${pathname}:${code}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {
      // storage blocked -- log anyway, the server rate-limits
    }
    recordReferralTouch({ code, path: pathname }).catch(() => {});
  }, [pathname]);

  return null;
}
