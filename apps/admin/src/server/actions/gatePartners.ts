"use server";

import {
  assertStepUpFresh,
  currentRequestMeta,
  requireAdmin,
} from "@/lib/adminGuard";
import {
  endGatePartnerLinkAdminCore,
  linkGatePartnerEventAdminCore,
  markGatePartnerVoidedAdminCore,
  previewGatePartnerCatalogAdminCore,
  recheckGatePartnerLinkAdminCore,
  retryGatePartnerPushAdminCore,
  setGatePartnerLinkStatusAdminCore,
} from "@abonten/services/admin/gatePartners/gatePartnersAdminCore";
import {
  gatePartnerEndLinkSchema,
  gatePartnerLinkSchema,
  gatePartnerLinkStatusSchema,
  gatePartnerMarkVoidedSchema,
  gatePartnerPreviewSchema,
  gatePartnerRecheckSchema,
  gatePartnerRetryPushSchema,
} from "@abonten/validation/gatePartnerSchemas";
import { revalidatePath } from "next/cache";
import { adminError, firstIssue, svc } from "./_shared";

// ── Gate partners (Admin › Gate partners) ───────────────────
// An event checked in by the organizer's own gate system (Hapniin): staff
// link it, watch the sales registered with the partner, retry the stuck
// ones and record codes as voided. Everything is re-checked and audited in
// @abonten/services/admin/gatePartners; every change needs
// gatepartners.manage and a fresh re-auth (it decides whose code admits a
// paying buyer at the gate).

function refresh(eventId?: string) {
  revalidatePath("/gate-partners");
  if (eventId) revalidatePath(`/gate-partners/${eventId}`);
}

/** The partner's live events and products for a key, to map from. */
export async function previewGatePartnerCatalog(input: unknown) {
  const parsed = gatePartnerPreviewSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed.error);
  try {
    const ctx = await requireAdmin({ redirectOnFail: false });
    assertStepUpFresh(ctx);
    return await previewGatePartnerCatalogAdminCore(svc(), ctx, parsed.data);
  } catch (e) {
    return adminError(e, "previewGatePartnerCatalog");
  }
}

export async function linkGatePartnerEvent(input: unknown) {
  const parsed = gatePartnerLinkSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed.error);
  try {
    const ctx = await requireAdmin({ redirectOnFail: false });
    assertStepUpFresh(ctx);
    const res = await linkGatePartnerEventAdminCore(
      svc(),
      ctx,
      parsed.data,
      await currentRequestMeta(),
    );
    if (res.status === 200) refresh(parsed.data.eventId);
    return res;
  } catch (e) {
    return adminError(e, "linkGatePartnerEvent");
  }
}

export async function setGatePartnerLinkStatus(input: unknown) {
  const parsed = gatePartnerLinkStatusSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed.error);
  try {
    const ctx = await requireAdmin({ redirectOnFail: false });
    assertStepUpFresh(ctx);
    const res = await setGatePartnerLinkStatusAdminCore(
      svc(),
      ctx,
      parsed.data,
      await currentRequestMeta(),
    );
    if (res.status === 200) refresh(parsed.data.eventId);
    return res;
  } catch (e) {
    return adminError(e, "setGatePartnerLinkStatus");
  }
}

export async function endGatePartnerLink(input: unknown) {
  const parsed = gatePartnerEndLinkSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed.error);
  try {
    const ctx = await requireAdmin({ redirectOnFail: false });
    assertStepUpFresh(ctx);
    const res = await endGatePartnerLinkAdminCore(
      svc(),
      ctx,
      parsed.data,
      await currentRequestMeta(),
    );
    if (res.status === 200) refresh(parsed.data.eventId);
    return res;
  } catch (e) {
    return adminError(e, "endGatePartnerLink");
  }
}

export async function recheckGatePartnerLink(input: unknown) {
  const parsed = gatePartnerRecheckSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed.error);
  try {
    const ctx = await requireAdmin({ redirectOnFail: false });
    assertStepUpFresh(ctx);
    const res = await recheckGatePartnerLinkAdminCore(svc(), ctx, parsed.data);
    if (res.status === 200) refresh(parsed.data.eventId);
    return res;
  } catch (e) {
    return adminError(e, "recheckGatePartnerLink");
  }
}

export async function retryGatePartnerPush(eventId: string, input: unknown) {
  const parsed = gatePartnerRetryPushSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed.error);
  try {
    const ctx = await requireAdmin({ redirectOnFail: false });
    assertStepUpFresh(ctx);
    const res = await retryGatePartnerPushAdminCore(
      svc(),
      ctx,
      parsed.data,
      await currentRequestMeta(),
    );
    if (res.status === 200) refresh(eventId);
    return res;
  } catch (e) {
    return adminError(e, "retryGatePartnerPush");
  }
}

export async function markGatePartnerVoided(input: unknown) {
  const parsed = gatePartnerMarkVoidedSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed.error);
  try {
    const ctx = await requireAdmin({ redirectOnFail: false });
    assertStepUpFresh(ctx);
    const res = await markGatePartnerVoidedAdminCore(
      svc(),
      ctx,
      parsed.data,
      await currentRequestMeta(),
    );
    if (res.status === 200) refresh(parsed.data.eventId);
    return res;
  } catch (e) {
    return adminError(e, "markGatePartnerVoided");
  }
}
