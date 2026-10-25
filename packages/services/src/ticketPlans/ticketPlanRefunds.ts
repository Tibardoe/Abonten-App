import { logger } from "@abonten/core/logger";
import { money } from "@abonten/core/money/money";
import type { Database } from "@abonten/types/database.types";
import { resolveProviderAccount } from "../payments/providers/registry";
import { PaymentProviderError } from "../payments/providers/types";
import { getSupabaseServiceClient } from "../supabase/serviceClient";
import {
  noticePlanRefundProblem,
  noticePlanRefunded,
} from "./ticketPlanNotices";

// A plan's money goes back through the charges that brought it in: every
// part was its own provider charge, so its share of the refund is a refund
// of that charge (ticket_plan_payment.refund_minor, planned in proportion
// by the database). Here the shares are asked of the provider, once each,
// and the provider's refund webhook says when each one lands.
//
// Asking twice could refund twice (a provider accepts several partial
// refunds of one charge), so a share is CLAIMED ('planned' → 'requesting')
// before the provider is called, and a failure that might have reached the
// provider is never retried automatically: it goes to staff (Admin ›
// Finance › Pay small small) with an incident. Only an answer that says the
// provider did nothing (rate limited, unavailable) puts the share back to
// be asked again by the next run of the ticket-plans job.

const BATCH = 50;
/** A share still 'requesting' after this long is handed to staff. */
export const STUCK_REQUESTING_MINUTES = 15;

type PlannedShare = {
  id: string;
  plan_id: string;
  amount_minor: number;
  refund_minor: number;
  refund_attempts: number;
  provider: string;
  provider_reference: string;
  provider_transaction_id: string | null;
  currency: string;
  plan: { country_code: string } | null;
};

function provablyNotProcessed(error: unknown): boolean {
  return (
    error instanceof PaymentProviderError &&
    (error.httpStatus === 429 || error.httpStatus === 503)
  );
}

async function openIncident(summary: string): Promise<void> {
  const { error } = await getSupabaseServiceClient().rpc(
    "open_reconciliation_incident",
    {
      p_component: "ticket_plans.refund",
      p_title: "A Pay small small refund needs a person",
      p_summary: summary,
      p_severity: "high",
    },
  );
  if (error) {
    logger.error(`ticketPlanRefunds: incident not opened (${error.message})`);
  }
}

async function rollup(planId: string): Promise<string | null> {
  const { data, error } = await getSupabaseServiceClient().rpc(
    "_ticket_plan_refund_rollup",
    { p_plan_id: planId },
  );
  if (error) {
    logger.error(`ticketPlanRefunds: rollup failed (${error.message})`);
    return null;
  }
  return (data as string | null) ?? null;
}

/**
 * Asks the provider for every planned share (of one plan, or of all plans),
 * each at most once. Returns how many were asked and how many need staff.
 */
export async function requestPlannedPlanRefunds(
  filter: { planId?: string } = {},
): Promise<{ requested: number; handedToStaff: number; retryLater: number }> {
  const supabase = getSupabaseServiceClient();
  let query = supabase
    .from("ticket_plan_payment")
    .select(
      "id, plan_id, amount_minor, refund_minor, refund_attempts, provider, provider_reference, provider_transaction_id, currency, plan:plan_id(country_code)",
    )
    .eq("refund_status", "planned")
    .order("created_at", { ascending: true })
    .limit(BATCH);
  if (filter.planId) query = query.eq("plan_id", filter.planId);
  const { data, error } = await query;
  if (error) {
    logger.error(`ticketPlanRefunds: listing shares failed (${error.message})`);
    return { requested: 0, handedToStaff: 0, retryLater: 0 };
  }

  let requested = 0;
  let handedToStaff = 0;
  let retryLater = 0;
  const touchedPlans = new Set<string>();

  for (const share of (data ?? []) as unknown as PlannedShare[]) {
    if (share.refund_minor <= 0) continue;
    const { data: claimed } = await supabase
      .from("ticket_plan_payment")
      .update({
        refund_status: "requesting",
        refund_claimed_at: new Date().toISOString(),
        refund_attempts: share.refund_attempts + 1,
      })
      .eq("id", share.id)
      .eq("refund_status", "planned")
      .select("id")
      .maybeSingle();
    if (!claimed) continue; // another run took it

    try {
      const { provider, account } = await resolveProviderAccount({
        countryCode: share.plan?.country_code ?? null,
        currency: share.currency,
        providerCode: share.provider,
      });
      await provider.refund(account, {
        reference: share.provider_reference,
        providerTransactionId: share.provider_transaction_id,
        amount: money(Number(share.refund_minor), share.currency),
      });
      // The webhook may already have marked it processed: only a share
      // still being requested moves on.
      await supabase
        .from("ticket_plan_payment")
        .update({
          refund_status: "requested",
          refund_requested_at: new Date().toISOString(),
          refund_failure: null,
        })
        .eq("id", share.id)
        .eq("refund_status", "requesting");
      requested += 1;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error ?? "unknown");
      if (provablyNotProcessed(error)) {
        await supabase
          .from("ticket_plan_payment")
          .update({
            refund_status: "planned",
            refund_claimed_at: null,
            refund_failure: message.slice(0, 500),
          })
          .eq("id", share.id)
          .eq("refund_status", "requesting");
        retryLater += 1;
      } else {
        logger.error(
          `ticketPlanRefunds: refund of share ${share.id} (plan ${share.plan_id}) failed: ${message}`,
        );
        await supabase
          .from("ticket_plan_payment")
          .update({
            refund_status: "failed",
            refund_failure: message.slice(0, 500),
          })
          .eq("id", share.id)
          .eq("refund_status", "requesting");
        await openIncident(
          `The refund of ${share.refund_minor} minor units on ${share.provider} reference ${share.provider_reference} (plan ${share.plan_id}) failed: ${message}. Check the provider's dashboard before retrying in Admin › Finance › Pay small small.`,
        );
        handedToStaff += 1;
        touchedPlans.add(share.plan_id);
      }
    }
  }

  for (const planId of touchedPlans) {
    if ((await rollup(planId)) === "failed") {
      await noticePlanRefundProblem(planId);
    }
  }

  return { requested, handedToStaff, retryLater };
}

/**
 * Shares claimed but never confirmed as asked (the request died between the
 * claim and the provider's answer): the provider may or may not have them,
 * so staff decide.
 */
export async function handOverStuckPlanRefunds(): Promise<number> {
  const supabase = getSupabaseServiceClient();
  const before = new Date(
    Date.now() - STUCK_REQUESTING_MINUTES * 60_000,
  ).toISOString();
  const { data, error } = await supabase
    .from("ticket_plan_payment")
    .update({
      refund_status: "failed",
      refund_failure:
        "The refund request did not finish; check the provider before retrying",
    })
    .eq("refund_status", "requesting")
    .lt("refund_claimed_at", before)
    .select("id, plan_id, provider, provider_reference");
  if (error) {
    logger.error(
      `ticketPlanRefunds: stuck shares not handed over (${error.message})`,
    );
    return 0;
  }
  const plans = new Set<string>();
  for (const row of data ?? []) {
    plans.add(row.plan_id);
    await openIncident(
      `A refund request for ${row.provider} reference ${row.provider_reference} (plan ${row.plan_id}) never finished. Check the provider's dashboard, then mark it done or retry in Admin › Finance › Pay small small.`,
    );
  }
  for (const planId of plans) {
    if ((await rollup(planId)) === "failed") {
      await noticePlanRefundProblem(planId);
    }
  }
  return data?.length ?? 0;
}

/**
 * The refund webhook for one of a plan's charges. Returns whether the
 * reference belonged to a plan part (the caller tries orphan captures next
 * when it did not).
 */
export async function handlePlanPartRefundOutcome(input: {
  provider: string;
  reference: string | null;
  providerTransactionId: string | null;
  outcome: "processed" | "failed";
  detail: string | null;
}): Promise<"matched" | "unmatched" | "error"> {
  if (!input.reference && !input.providerTransactionId) return "unmatched";
  const { data, error } = await getSupabaseServiceClient().rpc(
    "ticket_plan_part_refund_outcome",
    {
      p_provider: input.provider,
      p_reference: input.reference,
      p_provider_transaction_id: input.providerTransactionId,
      p_outcome: input.outcome,
      p_detail: input.detail,
      // The generated types say string; the SQL takes null for either key.
    } as unknown as Database["public"]["Functions"]["ticket_plan_part_refund_outcome"]["Args"],
  );
  if (error) {
    logger.error(`ticketPlanRefunds: outcome not recorded (${error.message})`);
    return "error";
  }
  const result = (data ?? {}) as {
    matched?: boolean;
    changed?: boolean;
    plan_id?: string;
    refund_status?: string;
    part_outcome?: string;
  };
  if (!result.matched) return "unmatched";
  if (result.changed && result.plan_id) {
    if (result.refund_status === "refunded") {
      await noticePlanRefunded(result.plan_id);
    } else if (result.part_outcome === "failed") {
      await openIncident(
        `${input.provider} refused the refund of reference ${input.reference ?? input.providerTransactionId} (plan ${result.plan_id}): ${input.detail ?? "no detail"}.`,
      );
      await noticePlanRefundProblem(result.plan_id);
    }
  }
  return "matched";
}

/**
 * A finished plan's purchase is being refunded: plan `refundMinor` (the
 * ticket revenue issueRefundCore worked out) across the parts' charges.
 */
export async function planPurchaseRefund(
  transactionId: string,
  refundMinor: number,
): Promise<{ ok: true; planId: string } | { ok: false; message: string }> {
  const { data, error } = await getSupabaseServiceClient().rpc(
    "ticket_plan_plan_purchase_refund",
    { p_transaction_id: transactionId, p_refund_minor: refundMinor },
  );
  if (error) {
    logger.error(
      `ticketPlanRefunds: purchase refund not planned for ${transactionId} (${error.message})`,
    );
    return { ok: false, message: error.message };
  }
  const result = (data ?? {}) as { plan_id?: string };
  return { ok: true, planId: result.plan_id ?? "" };
}
