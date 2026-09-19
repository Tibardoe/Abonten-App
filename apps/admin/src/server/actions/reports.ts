"use server";

import { currentRequestMeta, requireAdmin } from "@/lib/adminGuard";
import {
  addAdminNoteCore,
  assignReportCore,
  requestReportInfoCore,
  resolveReportCore,
  resolveReportGroupCore,
  updateReportStatusCore,
} from "@abonten/services/admin/reports/reportsAdminCore";
import {
  adminNoteSchema,
  reportAssignSchema,
  reportRequestInfoSchema,
  reportResolveSchema,
  reportStatusSchema,
  resolveReportGroupSchema,
} from "@abonten/validation/adminSchemas";
import { revalidatePath } from "next/cache";
import { adminError, svc } from "./_shared";

// ── Reports ─────────────────────────────────────────────────

export async function assignReport(input: unknown) {
  const parsed = reportAssignSchema.safeParse(input);
  if (!parsed.success) return { status: 400, message: "Invalid input" };
  try {
    const ctx = await requireAdmin({ redirectOnFail: false });
    const res = await assignReportCore(
      svc(),
      ctx,
      parsed.data,
      await currentRequestMeta(),
    );
    if (res.status === 200) revalidatePath(`/reports/${parsed.data.reportId}`);
    return res;
  } catch (e) {
    return adminError(e);
  }
}

export async function updateReportStatus(input: unknown) {
  const parsed = reportStatusSchema.safeParse(input);
  if (!parsed.success) return { status: 400, message: "Invalid input" };
  try {
    const ctx = await requireAdmin({ redirectOnFail: false });
    const res = await updateReportStatusCore(
      svc(),
      ctx,
      parsed.data,
      await currentRequestMeta(),
    );
    if (res.status === 200) revalidatePath(`/reports/${parsed.data.reportId}`);
    return res;
  } catch (e) {
    return adminError(e);
  }
}

export async function requestReportInfo(input: unknown) {
  const parsed = reportRequestInfoSchema.safeParse(input);
  if (!parsed.success) return { status: 400, message: "Invalid input" };
  try {
    const ctx = await requireAdmin({ redirectOnFail: false });
    const res = await requestReportInfoCore(
      svc(),
      ctx,
      parsed.data,
      await currentRequestMeta(),
    );
    if (res.status === 200) revalidatePath(`/reports/${parsed.data.reportId}`);
    return res;
  } catch (e) {
    return adminError(e);
  }
}

export async function addAdminNote(input: unknown) {
  const parsed = adminNoteSchema.safeParse(input);
  if (!parsed.success) return { status: 400, message: "Invalid input" };
  try {
    const ctx = await requireAdmin({ redirectOnFail: false });
    const res = await addAdminNoteCore(
      svc(),
      ctx,
      parsed.data,
      await currentRequestMeta(),
    );
    if (res.status === 200 && parsed.data.targetType === "report") {
      revalidatePath(`/reports/${parsed.data.targetId}`);
    }
    return res;
  } catch (e) {
    return adminError(e);
  }
}

export async function resolveReport(input: unknown) {
  const parsed = reportResolveSchema.safeParse(input);
  if (!parsed.success) {
    return {
      status: 400,
      message: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }
  try {
    const ctx = await requireAdmin({ redirectOnFail: false });
    const res = await resolveReportCore(
      svc(),
      ctx,
      parsed.data,
      await currentRequestMeta(),
    );
    if (res.status === 200) {
      revalidatePath(`/reports/${parsed.data.reportId}`);
      revalidatePath("/reports");
    }
    return res;
  } catch (e) {
    return adminError(e);
  }
}

export async function resolveReportGroup(input: unknown) {
  const parsed = resolveReportGroupSchema.safeParse(input);
  if (!parsed.success) {
    return {
      status: 400,
      message: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }
  try {
    const ctx = await requireAdmin({ redirectOnFail: false });
    const res = await resolveReportGroupCore(
      svc(),
      ctx,
      parsed.data,
      await currentRequestMeta(),
    );
    if (res.status === 200) revalidatePath("/reports");
    return res;
  } catch (e) {
    return adminError(e);
  }
}
