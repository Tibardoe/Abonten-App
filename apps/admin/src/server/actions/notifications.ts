"use server";

import {
  assertStepUpFresh,
  currentRequestMeta,
  requireAdmin,
} from "@/lib/adminGuard";
import {
  broadcastNotificationCore,
  resendNotificationCore,
} from "@abonten/services/admin/notifications/notificationsAdminCore";
import {
  broadcastNotificationSchema,
  resendNotificationSchema,
} from "@abonten/validation/adminSchemas";
import { revalidatePath } from "next/cache";
import { adminError, svc } from "./_shared";

// ── Notifications ───────────────────────────────────────────

export async function resendNotification(input: unknown) {
  const parsed = resendNotificationSchema.safeParse(input);
  if (!parsed.success) return { status: 400, message: "Invalid input" };
  try {
    const ctx = await requireAdmin({ redirectOnFail: false });
    const res = await resendNotificationCore(
      svc(),
      ctx,
      parsed.data,
      await currentRequestMeta(),
    );
    if (res.status === 200) {
      revalidatePath(`/notifications/${parsed.data.id}`);
      revalidatePath("/notifications");
    }
    return res;
  } catch (e) {
    return adminError(e);
  }
}

export async function broadcastNotification(input: unknown) {
  const parsed = broadcastNotificationSchema.safeParse(input);
  if (!parsed.success) {
    return {
      status: 400,
      message: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }
  try {
    const ctx = await requireAdmin({ redirectOnFail: false });
    assertStepUpFresh(ctx);
    const res = await broadcastNotificationCore(
      svc(),
      ctx,
      parsed.data,
      await currentRequestMeta(),
    );
    if (res.status === 200) revalidatePath("/notifications");
    return res;
  } catch (e) {
    return adminError(e);
  }
}
