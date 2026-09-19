"use server";

import { currentRequestMeta, requireAdmin } from "@/lib/adminGuard";
import {
  updateErrorGroupStatusCore,
  upsertIncidentCore,
} from "@abonten/services/admin/observability/observabilityCore";
import {
  errorGroupStatusSchema,
  incidentUpsertSchema,
} from "@abonten/validation/adminSchemas";
import { revalidatePath } from "next/cache";
import { adminError, svc } from "./_shared";

// ── Monitoring ──────────────────────────────────────────────

export async function setErrorGroupStatus(input: unknown) {
  const parsed = errorGroupStatusSchema.safeParse(input);
  if (!parsed.success) return { status: 400, message: "Invalid input" };
  try {
    const ctx = await requireAdmin({ redirectOnFail: false });
    const res = await updateErrorGroupStatusCore(
      svc(),
      ctx,
      parsed.data,
      await currentRequestMeta(),
    );
    if (res.status === 200) revalidatePath("/monitoring");
    return res;
  } catch (e) {
    return adminError(e);
  }
}

export async function upsertIncident(input: unknown) {
  const parsed = incidentUpsertSchema.safeParse(input);
  if (!parsed.success) {
    return {
      status: 400,
      message: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }
  try {
    const ctx = await requireAdmin({ redirectOnFail: false });
    const res = await upsertIncidentCore(
      svc(),
      ctx,
      parsed.data,
      await currentRequestMeta(),
    );
    if (res.status === 200) revalidatePath("/monitoring");
    return res;
  } catch (e) {
    return adminError(e);
  }
}
