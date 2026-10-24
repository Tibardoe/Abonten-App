"use server";

import {
  assertStepUpFresh,
  currentRequestMeta,
  requireAdmin,
} from "@/lib/adminGuard";
import {
  decideIdentityVerificationCore,
  revealIdentityPiiCore,
  revokeIdentityVerificationCore,
  updateIdentitySettingsCore,
} from "@abonten/services/admin/identity/identityAdminCore";
import {
  identityAdminDecisionSchema,
  identityAdminRevealSchema,
  identityAdminRevokeSchema,
  identitySettingsSchema,
} from "@abonten/validation/identitySchemas";
import { revalidatePath } from "next/cache";
import { adminError, firstIssue, svc } from "./_shared";

// ── Identity verification (Admin › Identity) ────────────────
// Everything is re-checked and audited in @abonten/services/admin/identity.
// Seeing someone's document details, revoking a check and changing the
// settings sit behind a fresh re-auth, like a ban.

/** Approve or reject a check that is waiting for review. identity.review. */
export async function decideIdentity(input: unknown) {
  const parsed = identityAdminDecisionSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed.error);
  try {
    const ctx = await requireAdmin({ redirectOnFail: false });
    const res = await decideIdentityVerificationCore(
      svc(),
      ctx,
      parsed.data,
      await currentRequestMeta(),
    );
    if (res.status === 200) {
      revalidatePath(`/identity/${parsed.data.verificationId}`);
      revalidatePath("/identity");
    }
    return res;
  } catch (e) {
    return adminError(e, "decideIdentity");
  }
}

/** Take a live check away. identity.revoke + step-up. */
export async function revokeIdentity(input: unknown) {
  const parsed = identityAdminRevokeSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed.error);
  try {
    const ctx = await requireAdmin({ redirectOnFail: false });
    assertStepUpFresh(ctx);
    const res = await revokeIdentityVerificationCore(
      svc(),
      ctx,
      parsed.data,
      await currentRequestMeta(),
    );
    if (res.status === 200) {
      revalidatePath(`/identity/${parsed.data.verificationId}`);
      revalidatePath("/identity");
    }
    return res;
  } catch (e) {
    return adminError(e, "revokeIdentity");
  }
}

/** The name, date of birth and document details. identity.view_pii + step-up. */
export async function revealIdentityPii(input: unknown) {
  const parsed = identityAdminRevealSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed.error);
  try {
    const ctx = await requireAdmin({ redirectOnFail: false });
    assertStepUpFresh(ctx);
    return await revealIdentityPiiCore(
      svc(),
      ctx,
      parsed.data,
      await currentRequestMeta(),
    );
  } catch (e) {
    return adminError(e, "revealIdentityPii");
  }
}

/** Admin › Identity › Settings. identity.configure + step-up; audited. */
export async function updateIdentitySettings(input: unknown) {
  const parsed = identitySettingsSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed.error);
  try {
    const ctx = await requireAdmin({ redirectOnFail: false });
    assertStepUpFresh(ctx);
    const res = await updateIdentitySettingsCore(
      svc(),
      ctx,
      parsed.data,
      await currentRequestMeta(),
    );
    if (res.status === 200) {
      revalidatePath("/identity");
      revalidatePath("/identity/settings");
    }
    return res;
  } catch (e) {
    return adminError(e, "updateIdentitySettings");
  }
}
