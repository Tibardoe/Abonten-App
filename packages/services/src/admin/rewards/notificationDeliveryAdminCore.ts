import { logger } from "@abonten/core/logger";
import type { AdminContext } from "@abonten/types/adminTypes";
import type { AdminNotificationDeliveryStats } from "@abonten/types/rewards";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import {
  type AdminEnvelope,
  adminError,
  assertPermission,
} from "../adminContext";

// How reward pushes and emails went (notification_delivery, migration
// 20260911152213). Read-only; shown under the notification switches on
// Admin > Rewards > Program settings.

type Counts = AdminNotificationDeliveryStats["push"];
const empty = (): Counts => ({ queued: 0, sent: 0, skipped: 0, failed: 0 });

export async function getNotificationDeliveryStatsCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
  sinceDays = 7,
): Promise<AdminEnvelope<AdminNotificationDeliveryStats>> {
  try {
    assertPermission(ctx, "rewards.view");
  } catch (e) {
    return adminError(e) as AdminEnvelope<never>;
  }

  const since = new Date(Date.now() - sinceDays * 86_400_000).toISOString();
  const [rows, config] = await Promise.all([
    supabase
      .from("notification_delivery")
      .select("channel, status")
      .eq("source", "rewards")
      .gte("created_at", since)
      .limit(20_000),
    supabase
      .from("notification_delivery_config")
      .select("dispatch_url, last_dispatched_at")
      .eq("id", true)
      .maybeSingle(),
  ]);
  if (rows.error || config.error) {
    logger.error(
      `getNotificationDeliveryStatsCore failed: ${rows.error?.message ?? config.error?.message}`,
    );
    return { status: 500, message: "Something went wrong" };
  }

  const push = empty();
  const email = empty();
  for (const row of rows.data ?? []) {
    const bucket = row.channel === "email" ? email : push;
    // An in-flight claim is still waiting as far as an admin is concerned.
    const status = row.status === "sending" ? "queued" : row.status;
    if (status in bucket) bucket[status as keyof Counts] += 1;
  }

  return {
    status: 200,
    data: {
      sinceDays,
      dispatchConfigured: !!config.data?.dispatch_url,
      lastDispatchedAt: config.data?.last_dispatched_at ?? null,
      push,
      email,
    },
  };
}
