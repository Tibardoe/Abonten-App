"use server";

import {
  assertStepUpFresh,
  currentRequestMeta,
  requireAdmin,
} from "@/lib/adminGuard";
import { updateSafetySettingsCore } from "@abonten/services/admin/safety/safetyAdminCore";
import { safetySettingsSchema } from "@abonten/validation/safetySchemas";
import { revalidatePath } from "next/cache";
import { adminError, firstIssue, svc } from "./_shared";

/** Admin › Safety › Settings. safety.configure + step-up; audited. */
export async function updateSafetySettings(input: unknown) {
  const parsed = safetySettingsSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed.error);
  try {
    const ctx = await requireAdmin({ redirectOnFail: false });
    assertStepUpFresh(ctx);
    const res = await updateSafetySettingsCore(
      svc(),
      ctx,
      parsed.data,
      await currentRequestMeta(),
    );
    if (res.status === 200) {
      revalidatePath("/safety");
      revalidatePath("/safety/settings");
    }
    return res;
  } catch (e) {
    return adminError(e, "updateSafetySettings");
  }
}
