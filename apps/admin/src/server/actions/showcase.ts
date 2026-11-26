"use server";

import {
  assertStepUpFresh,
  currentRequestMeta,
  requireAdmin,
} from "@/lib/adminGuard";
import {
  addShowcaseEntryCore,
  moveShowcaseEntryCore,
  removeShowcaseEntryCore,
  searchShowcaseCandidatesCore,
  updateShowcaseEntryCore,
  updateShowcaseSettingsCore,
} from "@abonten/services/admin/showcase/showcaseAdminCore";
import {
  showcaseAddSchema,
  showcaseMoveSchema,
  showcaseRemoveSchema,
  showcaseSearchSchema,
  showcaseSettingsSchema,
  showcaseUpdateEntrySchema,
} from "@abonten/validation/adminSchemas";
import { revalidatePath } from "next/cache";
import { adminError, firstIssue, svc } from "./_shared";

// ── Showcase (Admin › Showcase, the "On Abonten" wall) ───────
// Re-checked (showcase.view / showcase.edit) and audited in
// @abonten/services/admin/showcase. Changing the programme settings also
// needs a fresh sign-in (step-up), because it decides who sees the wall.

/** Hosts and places to add, with whether each would show now. */
export async function searchShowcaseCandidates(input: unknown) {
  const parsed = showcaseSearchSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed.error);
  try {
    const ctx = await requireAdmin({ redirectOnFail: false });
    return await searchShowcaseCandidatesCore(svc(), ctx, parsed.data);
  } catch (e) {
    return adminError(e, "searchShowcaseCandidates");
  }
}

/** Put a host or a place on a market's wall. */
export async function addShowcaseEntry(input: unknown) {
  const parsed = showcaseAddSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed.error);
  try {
    const ctx = await requireAdmin({ redirectOnFail: false });
    const res = await addShowcaseEntryCore(
      svc(),
      ctx,
      parsed.data,
      await currentRequestMeta(),
    );
    if (res.status === 200) revalidatePath("/showcase");
    return res;
  } catch (e) {
    return adminError(e, "addShowcaseEntry");
  }
}

/** Change an entry's city or note. */
export async function updateShowcaseEntry(input: unknown) {
  const parsed = showcaseUpdateEntrySchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed.error);
  try {
    const ctx = await requireAdmin({ redirectOnFail: false });
    const res = await updateShowcaseEntryCore(
      svc(),
      ctx,
      parsed.data,
      await currentRequestMeta(),
    );
    if (res.status === 200) revalidatePath("/showcase");
    return res;
  } catch (e) {
    return adminError(e, "updateShowcaseEntry");
  }
}

/** Move an entry one place up or down. */
export async function moveShowcaseEntry(input: unknown) {
  const parsed = showcaseMoveSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed.error);
  try {
    const ctx = await requireAdmin({ redirectOnFail: false });
    const res = await moveShowcaseEntryCore(
      svc(),
      ctx,
      parsed.data,
      await currentRequestMeta(),
    );
    if (res.status === 200) revalidatePath("/showcase");
    return res;
  } catch (e) {
    return adminError(e, "moveShowcaseEntry");
  }
}

/** Take an entry off the wall. */
export async function removeShowcaseEntry(input: unknown) {
  const parsed = showcaseRemoveSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed.error);
  try {
    const ctx = await requireAdmin({ redirectOnFail: false });
    const res = await removeShowcaseEntryCore(
      svc(),
      ctx,
      parsed.data,
      await currentRequestMeta(),
    );
    if (res.status === 200) revalidatePath("/showcase");
    return res;
  } catch (e) {
    return adminError(e, "removeShowcaseEntry");
  }
}

/** The switch, the audience, beta testers and the row sizes (step-up). */
export async function updateShowcaseSettings(input: unknown) {
  const parsed = showcaseSettingsSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed.error);
  try {
    const ctx = await requireAdmin({ redirectOnFail: false });
    assertStepUpFresh(ctx);
    const res = await updateShowcaseSettingsCore(
      svc(),
      ctx,
      parsed.data,
      await currentRequestMeta(),
    );
    if (res.status === 200) revalidatePath("/showcase");
    return res;
  } catch (e) {
    return adminError(e, "updateShowcaseSettings");
  }
}
