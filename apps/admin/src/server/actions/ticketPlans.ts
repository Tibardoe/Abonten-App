"use server";

import {
  assertStepUpFresh,
  currentRequestMeta,
  requireAdmin,
} from "@/lib/adminGuard";
import {
  endTicketPlanAdminCore,
  ticketPlanPartRefundAdminCore,
  updateTicketPlanSettingsCore,
} from "@abonten/services/admin/ticketPlans/ticketPlansAdminCore";
import {
  ticketPlanAdminEndSchema,
  ticketPlanAdminPartRefundSchema,
  ticketPlanSettingsSchema,
} from "@abonten/validation/ticketPlanSchemas";
import { revalidatePath } from "next/cache";
import { adminError, firstIssue, svc } from "./_shared";

// ── Pay small small (Admin › Finance › Pay small small) ─────
// Everything is re-checked and audited in
// @abonten/services/admin/ticketPlans. Ending a plan, touching a refund and
// changing the settings move money or the rules for it: each sits behind a
// fresh re-auth, like a refund.

/** The programme switches and plan rules. plans.configure + step-up. */
export async function updateTicketPlanSettings(input: unknown) {
  const parsed = ticketPlanSettingsSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed.error);
  try {
    const ctx = await requireAdmin({ redirectOnFail: false });
    assertStepUpFresh(ctx);
    const res = await updateTicketPlanSettingsCore(
      svc(),
      ctx,
      parsed.data,
      await currentRequestMeta(),
    );
    if (res.status === 200) revalidatePath("/ticket-plans/settings");
    return res;
  } catch (e) {
    return adminError(e, "updateTicketPlanSettings");
  }
}

/** Ends a running plan with its refund. plans.manage + step-up. */
export async function endTicketPlanAdmin(input: unknown) {
  const parsed = ticketPlanAdminEndSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed.error);
  try {
    const ctx = await requireAdmin({ redirectOnFail: false });
    assertStepUpFresh(ctx);
    const res = await endTicketPlanAdminCore(
      svc(),
      ctx,
      parsed.data,
      await currentRequestMeta(),
    );
    if (res.status === 200) {
      revalidatePath(`/ticket-plans/${parsed.data.planId}`);
      revalidatePath("/ticket-plans");
    }
    return res;
  } catch (e) {
    return adminError(e, "endTicketPlanAdmin");
  }
}

/**
 * A refused or unconfirmed refund share: ask the provider again, or record
 * it as refunded by hand. plans.manage + step-up.
 */
export async function ticketPlanPartRefundAdmin(
  planId: string,
  input: unknown,
) {
  const parsed = ticketPlanAdminPartRefundSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed.error);
  try {
    const ctx = await requireAdmin({ redirectOnFail: false });
    assertStepUpFresh(ctx);
    const res = await ticketPlanPartRefundAdminCore(
      svc(),
      ctx,
      parsed.data,
      await currentRequestMeta(),
    );
    if (res.status === 200) {
      revalidatePath(`/ticket-plans/${planId}`);
      revalidatePath("/ticket-plans");
    }
    return res;
  } catch (e) {
    return adminError(e, "ticketPlanPartRefundAdmin");
  }
}
