"use server";

import {
  assertStepUpFresh,
  currentRequestMeta,
  requireAdmin,
} from "@/lib/adminGuard";
import {
  grantAdminRoleCore,
  revokeAdminRoleCore,
  setAdminUserStatusCore,
  setRolePermissionCore,
} from "@abonten/services/admin/settings/adminSettingsCore";
import {
  grantAdminRoleSchema,
  revokeAdminRoleSchema,
  setAdminUserStatusSchema,
  setRolePermissionSchema,
} from "@abonten/validation/adminSchemas";
import { revalidatePath } from "next/cache";
import { adminError, svc } from "./_shared";

// ── Settings (step-up) ──────────────────────────────────────

export async function grantAdminRole(input: unknown) {
  const parsed = grantAdminRoleSchema.safeParse(input);
  if (!parsed.success) return { status: 400, message: "Invalid input" };
  try {
    const ctx = await requireAdmin({ redirectOnFail: false });
    assertStepUpFresh(ctx);
    const res = await grantAdminRoleCore(
      svc(),
      ctx,
      parsed.data,
      await currentRequestMeta(),
    );
    if (res.status === 200) revalidatePath("/settings");
    return res;
  } catch (e) {
    return adminError(e);
  }
}

export async function revokeAdminRole(input: unknown) {
  const parsed = revokeAdminRoleSchema.safeParse(input);
  if (!parsed.success) return { status: 400, message: "Invalid input" };
  try {
    const ctx = await requireAdmin({ redirectOnFail: false });
    assertStepUpFresh(ctx);
    const res = await revokeAdminRoleCore(
      svc(),
      ctx,
      parsed.data,
      await currentRequestMeta(),
    );
    if (res.status === 200) revalidatePath("/settings");
    return res;
  } catch (e) {
    return adminError(e);
  }
}

export async function setAdminUserStatus(input: unknown) {
  const parsed = setAdminUserStatusSchema.safeParse(input);
  if (!parsed.success) return { status: 400, message: "Invalid input" };
  try {
    const ctx = await requireAdmin({ redirectOnFail: false });
    assertStepUpFresh(ctx);
    const res = await setAdminUserStatusCore(
      svc(),
      ctx,
      parsed.data,
      await currentRequestMeta(),
    );
    if (res.status === 200) revalidatePath("/settings");
    return res;
  } catch (e) {
    return adminError(e);
  }
}

export async function setRolePermission(input: unknown) {
  const parsed = setRolePermissionSchema.safeParse(input);
  if (!parsed.success) {
    return {
      status: 400,
      message: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }
  try {
    const ctx = await requireAdmin({ redirectOnFail: false });
    assertStepUpFresh(ctx);
    const res = await setRolePermissionCore(
      svc(),
      ctx,
      parsed.data,
      await currentRequestMeta(),
    );
    if (res.status === 200) revalidatePath("/settings");
    return res;
  } catch (e) {
    return adminError(e);
  }
}
