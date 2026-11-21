"use server";

import { currentRequestMeta, requireAdmin } from "@/lib/adminGuard";
import {
  setSocialPostStatusCore,
  updateSocialQueueSettingsCore,
} from "@abonten/services/admin/social/socialQueueAdminCore";
import {
  socialPostStatusSchema,
  socialQueueSettingsSchema,
} from "@abonten/validation/adminSchemas";
import { revalidatePath } from "next/cache";
import { adminError, firstIssue, svc } from "./_shared";

// ── Social (Admin › Social, the posting queue) ──────────────
// Re-checked (social.manage) and audited in
// @abonten/services/admin/social. Nothing here posts anything: the person
// posts by hand, then says so here.

/** Mark one channel's post as posted or skipped, or put it back. */
export async function setSocialPostStatus(input: unknown) {
  const parsed = socialPostStatusSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed.error);
  try {
    const ctx = await requireAdmin({ redirectOnFail: false });
    const res = await setSocialPostStatusCore(
      svc(),
      ctx,
      parsed.data,
      await currentRequestMeta(),
    );
    if (res.status === 200) revalidatePath("/social");
    return res;
  } catch (e) {
    return adminError(e, "setSocialPostStatus");
  }
}

/** On/off, the daily cap on new listings, and the accounts never posted. */
export async function updateSocialQueueSettings(input: unknown) {
  const parsed = socialQueueSettingsSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed.error);
  try {
    const ctx = await requireAdmin({ redirectOnFail: false });
    const res = await updateSocialQueueSettingsCore(
      svc(),
      ctx,
      parsed.data,
      await currentRequestMeta(),
    );
    if (res.status === 200) revalidatePath("/social");
    return res;
  } catch (e) {
    return adminError(e, "updateSocialQueueSettings");
  }
}
