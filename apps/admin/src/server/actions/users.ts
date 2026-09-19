"use server";

import {
  assertStepUpFresh,
  currentRequestMeta,
  requireAdmin,
} from "@/lib/adminGuard";
import { setUserStatusCore } from "@abonten/services/admin/users/usersAdminCore";
import { setUserStatusSchema } from "@abonten/validation/adminSchemas";
import { revalidatePath } from "next/cache";
import { adminError, svc } from "./_shared";

// ── Users ───────────────────────────────────────────────────

export async function setUserStatus(input: unknown) {
  const parsed = setUserStatusSchema.safeParse(input);
  if (!parsed.success) {
    return {
      status: 400,
      message: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }
  try {
    const ctx = await requireAdmin({ redirectOnFail: false });
    if (parsed.data.status === "Banned") assertStepUpFresh(ctx);
    const res = await setUserStatusCore(
      svc(),
      ctx,
      parsed.data,
      await currentRequestMeta(),
    );
    if (res.status === 200) {
      revalidatePath(`/users/${parsed.data.userId}`);
      revalidatePath("/users");
    }
    return res;
  } catch (e) {
    return adminError(e);
  }
}
