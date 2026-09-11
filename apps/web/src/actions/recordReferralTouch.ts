"use server";

import { createClient } from "@/config/supabase/server";
import { DEVICE_COOKIE_NAME } from "@abonten/services/rewards/referralCookie";
import {
  recordDeviceInstallCore,
  recordReferralTouchCore,
} from "@abonten/services/rewards/referralCore";
import { cookies, headers } from "next/headers";

/**
 * A page was opened through a referral link (`?ref=CODE`). Logged
 * fire-and-forget by ReferralTouchLogger; works signed out. The referral
 * itself is already remembered in the signed abn_ref cookie by proxy.ts --
 * this is the click log, plus the cross-device attribution for a signed-in
 * visitor.
 */
export async function recordReferralTouch(input: {
  code: string;
  path: string;
}) {
  if (typeof input?.code !== "string" || typeof input?.path !== "string") {
    return { status: 400 };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const headerList = await headers();
  const cookieStore = await cookies();
  const installId = cookieStore.get(DEVICE_COOKIE_NAME)?.value ?? null;

  const [section, slug] = input.path.split("/").filter(Boolean);
  const result = await recordReferralTouchCore({
    code: input.code,
    eventSlug: section === "events" && slug ? decodeURIComponent(slug) : null,
    placeSlug: section === "places" && slug ? decodeURIComponent(slug) : null,
    visitorUserId: user?.id ?? null,
    installId,
    ip: headerList.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: headerList.get("user-agent"),
    platform: "web",
  });

  if (user) {
    await recordDeviceInstallCore(installId, user.id, "web");
  }

  return { status: result.status };
}
