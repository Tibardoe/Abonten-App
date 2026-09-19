"use server";

import { currentRequestMeta, requireAdmin } from "@/lib/adminGuard";
import { reviewClaimCore } from "@abonten/services/admin/claims/claimsAdminCore";
import { reviewClaimSchema } from "@abonten/validation/adminSchemas";
import { revalidatePath } from "next/cache";
import { adminError, svc } from "./_shared";

// ── Claims ──────────────────────────────────────────────────

export async function reviewClaim(input: unknown) {
  const parsed = reviewClaimSchema.safeParse(input);
  if (!parsed.success) {
    return {
      status: 400,
      message: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }
  try {
    const ctx = await requireAdmin({ redirectOnFail: false });
    const res = await reviewClaimCore(
      svc(),
      ctx,
      parsed.data,
      await currentRequestMeta(),
    );
    if (res.status === 200) {
      revalidatePath(`/claims/${parsed.data.claimId}`);
      revalidatePath("/claims");
    }
    return res;
  } catch (e) {
    return adminError(e);
  }
}
