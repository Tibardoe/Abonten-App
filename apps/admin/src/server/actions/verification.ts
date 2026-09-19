"use server";

import {
  assertStepUpFresh,
  currentRequestMeta,
  requireAdmin,
} from "@/lib/adminGuard";
import {
  addVerificationNoteCore,
  decideVerificationCaseCore,
  revokeVerificationCore,
} from "@abonten/services/admin/verification/verificationAdminCore";
import {
  decideVerificationSchema,
  revokeVerificationSchema,
  verificationNoteSchema,
} from "@abonten/validation/adminSchemas";
import { revalidatePath } from "next/cache";
import { adminError, svc } from "./_shared";

// ── Trust & Verification ────────────────────────────────────

export async function decideVerification(input: unknown) {
  const parsed = decideVerificationSchema.safeParse(input);
  if (!parsed.success) {
    return {
      status: 400,
      message: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }
  try {
    const ctx = await requireAdmin({ redirectOnFail: false });
    const res = await decideVerificationCaseCore(
      svc(),
      ctx,
      parsed.data,
      await currentRequestMeta(),
    );
    if (res.status === 200) {
      revalidatePath(`/verification/${parsed.data.caseId}`);
      revalidatePath("/verification");
    }
    return res;
  } catch (e) {
    return adminError(e, "decideVerification");
  }
}

export async function revokeVerification(input: unknown) {
  const parsed = revokeVerificationSchema.safeParse(input);
  if (!parsed.success) {
    return {
      status: 400,
      message: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }
  try {
    const ctx = await requireAdmin({ redirectOnFail: false });
    // Taking a live badge away is as consequential as a ban, so it sits
    // behind the same fresh re-auth.
    assertStepUpFresh(ctx);
    const res = await revokeVerificationCore(
      svc(),
      ctx,
      parsed.data,
      await currentRequestMeta(),
    );
    if (res.status === 200) {
      revalidatePath(`/verification/${parsed.data.caseId}`);
      revalidatePath("/verification");
    }
    return res;
  } catch (e) {
    return adminError(e, "revokeVerification");
  }
}

export async function addVerificationNote(input: unknown) {
  const parsed = verificationNoteSchema.safeParse(input);
  if (!parsed.success) {
    return {
      status: 400,
      message: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }
  try {
    const ctx = await requireAdmin({ redirectOnFail: false });
    const res = await addVerificationNoteCore(svc(), ctx, parsed.data);
    if (res.status === 200) {
      revalidatePath(`/verification/${parsed.data.caseId}`);
    }
    return res;
  } catch (e) {
    return adminError(e, "addVerificationNote");
  }
}
