"use server";

import {
  assertStepUpFresh,
  currentRequestMeta,
  requireAdmin,
} from "@/lib/adminGuard";
import { updateTicketTransferSettingsCore } from "@abonten/services/admin/ticketTransfers/ticketTransfersAdminCore";
import { ticketTransferSettingsSchema } from "@abonten/validation/ticketTransferSchemas";
import { revalidatePath } from "next/cache";
import { adminError, firstIssue, svc } from "./_shared";

// ── Ticket transfers (Admin › Ticket transfers) ─────────────
// Re-checked and audited in @abonten/services/admin/ticketTransfers. The
// settings open sending tickets to more people, so they sit behind a fresh
// re-auth like the other programme switches.

/** The programme switches and rules. transfers.configure + step-up. */
export async function updateTicketTransferSettings(input: unknown) {
  const parsed = ticketTransferSettingsSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed.error);
  try {
    const ctx = await requireAdmin({ redirectOnFail: false });
    assertStepUpFresh(ctx);
    const res = await updateTicketTransferSettingsCore(
      svc(),
      ctx,
      parsed.data,
      await currentRequestMeta(),
    );
    if (res.status === 200) revalidatePath("/ticket-transfers");
    return res;
  } catch (e) {
    return adminError(e, "updateTicketTransferSettings");
  }
}
