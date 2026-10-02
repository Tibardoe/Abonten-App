"use server";

import { createClient } from "@/config/supabase/server";
import { withActionLocale } from "@/i18n/withActionLocale";
import { logger } from "@abonten/core/logger";
import { getContentProgramCore } from "@abonten/services/content/contentProgram";
import { getMyFieldOpsCore } from "@abonten/services/fieldOps/member/myFieldOpsQuery";
import {
  type MarketContextResult,
  getMarketContextCore,
} from "@abonten/services/markets/marketContextCore";
import { getUnreadMessageCount } from "@abonten/services/messaging/conversationsQuery";
import { unreadNotificationCountFor } from "@abonten/services/notifications/notificationsQuery";
import {
  type UserEventRoleResult,
  type UserPlaceRoleResult,
  userEventRoleQuery,
  userPlaceRoleQuery,
} from "@abonten/services/profile/userRolesQuery";
import { getRewardsProgramCore } from "@abonten/services/rewards/rewardsProgramQuery";
import { getDiscoveryProgramCore } from "@abonten/services/search/discoveryProgram";
import { getSupabaseServiceClient } from "@abonten/services/supabase/serviceClient";
import { getWeeklyProgramCore } from "@abonten/services/weekly/weeklyProgram";
import {
  type ContentProgram,
  DISABLED_CONTENT_PROGRAM,
} from "@abonten/types/contentType";
import type { Database } from "@abonten/types/database.types";
import {
  DISABLED_DISCOVERY_PROGRAM,
  type DiscoveryProgram,
} from "@abonten/types/discoveryType";
import type { FieldOpsMe } from "@abonten/types/fieldOps";
import type { RewardsProgram } from "@abonten/types/rewards";
import {
  DISABLED_WEEKLY_PROGRAM,
  type WeeklyProgram,
} from "@abonten/types/weeklyType";
import { cookies, headers } from "next/headers";

type UserInfoRow = Database["public"]["Tables"]["user_info"]["Row"];

/**
 * Everything the site's header and navigation ask about the visitor, in
 * one answer. Each value is exactly what its own action returns
 * (getWeeklyProgram, getUnreadMessageCount, …): those stay, for refreshing
 * one thing at a time. See hooks/shellBootstrap.ts for how the hooks share
 * this.
 */
export type ShellBootstrap = {
  /** Who the answers are for; null when nobody is signed in. */
  userId: string | null;
  weeklyProgram: WeeklyProgram;
  contentProgram: ContentProgram | null;
  discoveryProgram: DiscoveryProgram;
  rewardsProgram: RewardsProgram | undefined;
  /** Undefined when it could not be worked out: the hook asks again itself. */
  marketContext: MarketContextResult | undefined;
  fieldOps: FieldOpsMe | null;
  unreadMessages: number;
  unreadNotifications: number;
  userDetails: UserInfoRow | null;
  eventRole: UserEventRoleResult | { status: 401; role: "none" };
  placeRole: UserPlaceRoleResult | { status: 401; role: "none" };
};

/** A part that fails must not take the others down: it gets its fallback. */
async function part<T>(
  name: string,
  work: () => PromiseLike<T>,
  fallback: T,
): Promise<T> {
  try {
    return await work();
  } catch (error) {
    logger.error(`getShellBootstrap: ${name} failed`, error);
    return fallback;
  }
}

// A signed-in person's page used to open with ten of these questions asked
// one after the other (Next.js runs a browser's Server Actions one at a
// time): about a second of round trips before the header knew whether to
// show Dashboard, and each of them a function call with its own two checks
// of the session. They are asked here together, with the session checked
// once.
export default withActionLocale(async function getShellBootstrap(
  input: { viewerTimeZone?: string | null; viewerLocale?: string | null } = {},
): Promise<{ status: 200; data: ShellBootstrap }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const userId = user?.id ?? null;
  const svc = getSupabaseServiceClient();

  const headerList = await headers();
  const cookieStore = await cookies();
  const requestCountry =
    headerList.get("x-vercel-ip-country") ??
    headerList.get("x-country-code") ??
    cookieStore.get("country")?.value ??
    null;

  const signedOut = { status: 401 as const, role: "none" as const };

  const [
    weeklyProgram,
    contentProgram,
    discoveryProgram,
    rewardsProgram,
    marketContext,
    fieldOps,
    unreadMessages,
    unreadNotifications,
    userDetails,
    eventRole,
    placeRole,
  ] = await Promise.all([
    part(
      "weekly",
      async () => (await getWeeklyProgramCore(svc, userId)).data,
      DISABLED_WEEKLY_PROGRAM,
    ),
    part<ContentProgram | null>(
      "content",
      async () => (await getContentProgramCore(svc, userId)).data,
      DISABLED_CONTENT_PROGRAM,
    ),
    part(
      "discovery",
      async () => (await getDiscoveryProgramCore(svc, userId)).data,
      DISABLED_DISCOVERY_PROGRAM,
    ),
    part<RewardsProgram | undefined>(
      "rewards",
      async () => (await getRewardsProgramCore(supabase)).data,
      undefined,
    ),
    part<MarketContextResult | undefined>(
      "market",
      () =>
        getMarketContextCore({
          supabase,
          userId,
          browsingCountry: null,
          requestCountry,
          viewerTimeZone: input.viewerTimeZone ?? null,
          viewerLocale:
            input.viewerLocale ??
            headerList.get("accept-language")?.split(",")[0] ??
            null,
          platform: "web",
        }),
      undefined,
    ),
    userId
      ? part<FieldOpsMe | null>(
          "fieldOps",
          async () => (await getMyFieldOpsCore(svc, userId)).data ?? null,
          null,
        )
      : null,
    userId
      ? part(
          "unreadMessages",
          async () => {
            const res = await getUnreadMessageCount(supabase, userId);
            return res.status === 200 ? res.count : 0;
          },
          0,
        )
      : 0,
    userId
      ? part(
          "unreadNotifications",
          async () => {
            const res = await unreadNotificationCountFor(supabase, userId);
            return res.status === 200 ? res.count : 0;
          },
          0,
        )
      : 0,
    userId
      ? part<UserInfoRow | null>(
          "userDetails",
          async () =>
            (
              await supabase
                .from("user_info")
                .select("*")
                .eq("id", userId)
                .maybeSingle()
            ).data,
          null,
        )
      : null,
    userId
      ? part<ShellBootstrap["eventRole"]>(
          "eventRole",
          () => userEventRoleQuery(supabase, userId),
          { status: 200, role: "none" },
        )
      : signedOut,
    userId
      ? part<ShellBootstrap["placeRole"]>(
          "placeRole",
          () => userPlaceRoleQuery(supabase, userId),
          { status: 200, role: "none" },
        )
      : signedOut,
  ]);

  return {
    status: 200,
    data: {
      userId,
      weeklyProgram,
      contentProgram,
      discoveryProgram,
      rewardsProgram,
      marketContext,
      fieldOps,
      unreadMessages,
      unreadNotifications,
      userDetails,
      eventRole,
      placeRole,
    },
  };
});
