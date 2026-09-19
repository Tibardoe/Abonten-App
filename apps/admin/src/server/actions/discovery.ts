"use server";

import {
  assertStepUpFresh,
  currentRequestMeta,
  requireAdmin,
} from "@/lib/adminGuard";
import { updateDiscoverySettingsCore } from "@abonten/services/admin/discovery/discoveryAdminCore";
import {
  deleteSearchConceptCore,
  previewSearchConceptCore,
  saveSearchConceptCore,
} from "@abonten/services/admin/discovery/searchVocabularyAdminCore";
import {
  discoverySettingsSchema,
  searchConceptDeleteSchema,
  searchConceptPreviewSchema,
  searchConceptSaveSchema,
} from "@abonten/validation/adminSchemas";
import { revalidatePath } from "next/cache";
import { adminError, firstIssue, svc } from "./_shared";

// ── Discovery (search + recommendation notifications) ───────
// discovery.configure is in STEP_UP_PERMISSIONS.

export async function updateDiscoverySettings(input: unknown) {
  const parsed = discoverySettingsSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed.error);
  try {
    const ctx = await requireAdmin({ redirectOnFail: false });
    assertStepUpFresh(ctx);
    const res = await updateDiscoverySettingsCore(
      svc(),
      ctx,
      parsed.data,
      await currentRequestMeta(),
    );
    if (res.status === 200) {
      revalidatePath("/discovery");
      revalidatePath("/discovery/settings");
    }
    return res;
  } catch (e) {
    return adminError(e, "updateDiscoverySettings");
  }
}

// Search vocabulary: a preview only reads (discovery.view); saving and
// removing change what every search finds, so they sit behind
// discovery.configure and its step-up like the programme settings.

export async function previewSearchConcept(input: unknown) {
  const parsed = searchConceptPreviewSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed.error);
  try {
    const ctx = await requireAdmin({ redirectOnFail: false });
    return await previewSearchConceptCore(svc(), ctx, parsed.data);
  } catch (e) {
    return adminError(e, "previewSearchConcept");
  }
}

export async function saveSearchConcept(input: unknown) {
  const parsed = searchConceptSaveSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed.error);
  try {
    const ctx = await requireAdmin({ redirectOnFail: false });
    assertStepUpFresh(ctx);
    const res = await saveSearchConceptCore(
      svc(),
      ctx,
      parsed.data,
      await currentRequestMeta(),
    );
    if (res.status === 200) revalidatePath("/discovery/vocabulary");
    return res;
  } catch (e) {
    return adminError(e, "saveSearchConcept");
  }
}

export async function deleteSearchConcept(input: unknown) {
  const parsed = searchConceptDeleteSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed.error);
  try {
    const ctx = await requireAdmin({ redirectOnFail: false });
    assertStepUpFresh(ctx);
    const res = await deleteSearchConceptCore(
      svc(),
      ctx,
      parsed.data,
      await currentRequestMeta(),
    );
    if (res.status === 200) revalidatePath("/discovery/vocabulary");
    return res;
  } catch (e) {
    return adminError(e, "deleteSearchConcept");
  }
}
