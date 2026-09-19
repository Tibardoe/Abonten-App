"use server";

import {
  assertStepUpFresh,
  currentRequestMeta,
  requireAdmin,
} from "@/lib/adminGuard";
import { geocodeQueryCore } from "@abonten/services/admin/fieldOps/regionsAdminCore";
import {
  addWeeklyItemCore,
  addWeeklySectionCore,
  createWeeklyEditionCore,
  deleteWeeklySectionCore,
  getWeeklyPreviewLinkCore,
  removeWeeklyItemCore,
  reorderWeeklyItemsCore,
  reorderWeeklySectionsCore,
  searchWeeklySubjectsCore,
  transitionWeeklyEditionCore,
  updateWeeklyEditionCore,
  updateWeeklyItemCore,
  updateWeeklySectionCore,
} from "@abonten/services/admin/weekly/weeklyAdminCore";
import {
  updateWeeklySettingsCore,
  upsertWeeklyScopeCore,
} from "@abonten/services/admin/weekly/weeklySettingsAdminCore";
import { fieldOpsGeocodeSchema } from "@abonten/validation/fieldOpsSchemas";
import {
  addWeeklyItemSchema,
  addWeeklySectionSchema,
  createWeeklyEditionSchema,
  deleteWeeklySectionSchema,
  removeWeeklyItemSchema,
  reorderWeeklyItemsSchema,
  reorderWeeklySectionsSchema,
  updateWeeklyEditionSchema,
  updateWeeklyItemSchema,
  updateWeeklySectionSchema,
  weeklyPreviewLinkSchema,
  weeklyScopeSchema,
  weeklySettingsSchema,
  weeklySubjectSearchSchema,
  weeklyTransitionSchema,
} from "@abonten/validation/weeklySchemas";
import { revalidatePath } from "next/cache";
import { adminError, firstIssue, svc } from "./_shared";

// ── Abonten Weekly ──────────────────────────────────────────
// weekly.edit changes content; weekly.publish (step-up) schedules,
// publishes and unpublishes; weekly.configure (step-up) changes areas and
// settings. Every core re-checks its permission and audits.

function revalidateWeekly(editionId?: string) {
  revalidatePath("/weekly");
  if (editionId) revalidatePath(`/weekly/${editionId}`);
}

const WEEKLY_STEP_UP_ACTIONS = new Set([
  "schedule",
  "unschedule",
  "publish",
  "unpublish",
]);

export async function createWeeklyEdition(input: unknown) {
  const parsed = createWeeklyEditionSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed.error);
  try {
    const ctx = await requireAdmin({ redirectOnFail: false });
    const res = await createWeeklyEditionCore(
      svc(),
      ctx,
      parsed.data,
      await currentRequestMeta(),
    );
    if (res.status === 200) revalidateWeekly();
    return res;
  } catch (e) {
    return adminError(e, "createWeeklyEdition");
  }
}

export async function updateWeeklyEdition(input: unknown) {
  const parsed = updateWeeklyEditionSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed.error);
  try {
    const ctx = await requireAdmin({ redirectOnFail: false });
    const res = await updateWeeklyEditionCore(
      svc(),
      ctx,
      parsed.data,
      await currentRequestMeta(),
    );
    if (res.status === 200) revalidateWeekly(parsed.data.editionId);
    return res;
  } catch (e) {
    return adminError(e, "updateWeeklyEdition");
  }
}

export async function addWeeklySection(input: unknown) {
  const parsed = addWeeklySectionSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed.error);
  try {
    const ctx = await requireAdmin({ redirectOnFail: false });
    const res = await addWeeklySectionCore(
      svc(),
      ctx,
      parsed.data,
      await currentRequestMeta(),
    );
    if (res.status === 200) revalidateWeekly(parsed.data.editionId);
    return res;
  } catch (e) {
    return adminError(e, "addWeeklySection");
  }
}

export async function updateWeeklySection(input: unknown) {
  const parsed = updateWeeklySectionSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed.error);
  try {
    const ctx = await requireAdmin({ redirectOnFail: false });
    const res = await updateWeeklySectionCore(
      svc(),
      ctx,
      parsed.data,
      await currentRequestMeta(),
    );
    if (res.status === 200) revalidateWeekly(parsed.data.editionId);
    return res;
  } catch (e) {
    return adminError(e, "updateWeeklySection");
  }
}

export async function deleteWeeklySection(input: unknown) {
  const parsed = deleteWeeklySectionSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed.error);
  try {
    const ctx = await requireAdmin({ redirectOnFail: false });
    const res = await deleteWeeklySectionCore(
      svc(),
      ctx,
      parsed.data,
      await currentRequestMeta(),
    );
    if (res.status === 200) revalidateWeekly(parsed.data.editionId);
    return res;
  } catch (e) {
    return adminError(e, "deleteWeeklySection");
  }
}

export async function reorderWeeklySections(input: unknown) {
  const parsed = reorderWeeklySectionsSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed.error);
  try {
    const ctx = await requireAdmin({ redirectOnFail: false });
    const res = await reorderWeeklySectionsCore(
      svc(),
      ctx,
      parsed.data,
      await currentRequestMeta(),
    );
    if (res.status === 200) revalidateWeekly(parsed.data.editionId);
    return res;
  } catch (e) {
    return adminError(e, "reorderWeeklySections");
  }
}

export async function addWeeklyItem(input: unknown) {
  const parsed = addWeeklyItemSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed.error);
  try {
    const ctx = await requireAdmin({ redirectOnFail: false });
    const res = await addWeeklyItemCore(
      svc(),
      ctx,
      parsed.data,
      await currentRequestMeta(),
    );
    if (res.status === 200) revalidateWeekly(parsed.data.editionId);
    return res;
  } catch (e) {
    return adminError(e, "addWeeklyItem");
  }
}

export async function updateWeeklyItem(input: unknown) {
  const parsed = updateWeeklyItemSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed.error);
  try {
    const ctx = await requireAdmin({ redirectOnFail: false });
    const res = await updateWeeklyItemCore(
      svc(),
      ctx,
      parsed.data,
      await currentRequestMeta(),
    );
    if (res.status === 200) revalidateWeekly(parsed.data.editionId);
    return res;
  } catch (e) {
    return adminError(e, "updateWeeklyItem");
  }
}

export async function removeWeeklyItem(input: unknown) {
  const parsed = removeWeeklyItemSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed.error);
  try {
    const ctx = await requireAdmin({ redirectOnFail: false });
    const res = await removeWeeklyItemCore(
      svc(),
      ctx,
      parsed.data,
      await currentRequestMeta(),
    );
    if (res.status === 200) revalidateWeekly(parsed.data.editionId);
    return res;
  } catch (e) {
    return adminError(e, "removeWeeklyItem");
  }
}

export async function reorderWeeklyItems(input: unknown) {
  const parsed = reorderWeeklyItemsSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed.error);
  try {
    const ctx = await requireAdmin({ redirectOnFail: false });
    const res = await reorderWeeklyItemsCore(
      svc(),
      ctx,
      parsed.data,
      await currentRequestMeta(),
    );
    if (res.status === 200) revalidateWeekly(parsed.data.editionId);
    return res;
  } catch (e) {
    return adminError(e, "reorderWeeklyItems");
  }
}

export async function transitionWeeklyEdition(input: unknown) {
  const parsed = weeklyTransitionSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed.error);
  try {
    const ctx = await requireAdmin({ redirectOnFail: false });
    if (WEEKLY_STEP_UP_ACTIONS.has(parsed.data.action)) {
      assertStepUpFresh(ctx);
    }
    const res = await transitionWeeklyEditionCore(
      svc(),
      ctx,
      parsed.data,
      await currentRequestMeta(),
    );
    if (res.status === 200) revalidateWeekly(parsed.data.editionId);
    return res;
  } catch (e) {
    return adminError(e, "transitionWeeklyEdition");
  }
}

export async function searchWeeklySubjects(input: unknown) {
  const parsed = weeklySubjectSearchSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed.error);
  try {
    const ctx = await requireAdmin({ redirectOnFail: false });
    return await searchWeeklySubjectsCore(svc(), ctx, parsed.data);
  } catch (e) {
    return adminError(e, "searchWeeklySubjects");
  }
}

export async function getWeeklyPreviewLink(input: unknown) {
  const parsed = weeklyPreviewLinkSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed.error);
  try {
    const ctx = await requireAdmin({ redirectOnFail: false });
    return await getWeeklyPreviewLinkCore(svc(), ctx, parsed.data);
  } catch (e) {
    return adminError(e, "getWeeklyPreviewLink");
  }
}

export async function upsertWeeklyScope(input: unknown) {
  const parsed = weeklyScopeSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed.error);
  try {
    const ctx = await requireAdmin({ redirectOnFail: false });
    assertStepUpFresh(ctx);
    const res = await upsertWeeklyScopeCore(
      svc(),
      ctx,
      parsed.data,
      await currentRequestMeta(),
    );
    if (res.status === 200) revalidatePath("/weekly/areas");
    return res;
  } catch (e) {
    return adminError(e, "upsertWeeklyScope");
  }
}

export async function geocodeWeeklyArea(input: unknown) {
  const parsed = fieldOpsGeocodeSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed.error);
  try {
    const ctx = await requireAdmin({ redirectOnFail: false });
    return await geocodeQueryCore(
      ctx,
      parsed.data.query,
      fetch,
      "weekly.configure",
    );
  } catch (e) {
    return adminError(e, "geocodeWeeklyArea");
  }
}

export async function updateWeeklySettings(input: unknown) {
  const parsed = weeklySettingsSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed.error);
  try {
    const ctx = await requireAdmin({ redirectOnFail: false });
    assertStepUpFresh(ctx);
    const res = await updateWeeklySettingsCore(
      svc(),
      ctx,
      parsed.data,
      await currentRequestMeta(),
    );
    if (res.status === 200) {
      revalidatePath("/weekly");
      revalidatePath("/weekly/settings");
    }
    return res;
  } catch (e) {
    return adminError(e, "updateWeeklySettings");
  }
}
