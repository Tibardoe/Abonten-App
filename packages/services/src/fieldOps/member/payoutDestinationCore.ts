import { logger } from "@abonten/core/logger";
import { maskAccountNumber } from "@abonten/core/maskAccountNumber";
import type { FieldOpsPayoutDestination } from "@abonten/types/fieldOps";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import {
  fieldOpsError,
  requireMembership,
  resolveFieldOpsContext,
} from "../shared/fieldOpsContext";
import { type FieldOpsEnvelope, dbErr } from "../shared/fieldOpsRows";

// Where a member's earnings are sent. The member is the only one who can
// set it (an admin can read it with users.view_pii, never write it), and it
// is read back masked — the full number never leaves the server except in
// the finance CSV.
//
// Changing it while money is already in an approved batch would send the
// payment to a number the batch never recorded, so it is refused until the
// batch is paid or cancelled.

export async function getPayoutDestinationCore(
  supabase: ServiceRoleClient,
  userId: string,
  input: { campaignId: string },
): Promise<FieldOpsEnvelope<FieldOpsPayoutDestination>> {
  let membershipId: string;
  try {
    const ctx = await resolveFieldOpsContext(supabase, userId);
    membershipId = requireMembership(ctx, input.campaignId).membershipId;
  } catch (e) {
    return fieldOpsError(e);
  }
  const { data, error } = await supabase
    .from("fieldops_team_member")
    .select(
      "payout_momo_number, payout_momo_network, payout_holder_name, payout_updated_at",
    )
    .eq("id", membershipId)
    .maybeSingle();
  if (error) return dbErr(error, "Could not load your payout details");
  return {
    status: 200,
    data: {
      numberMasked: data?.payout_momo_number
        ? maskAccountNumber(data.payout_momo_number)
        : null,
      network: data?.payout_momo_network ?? null,
      holderName: data?.payout_holder_name ?? null,
      updatedAt: data?.payout_updated_at ?? null,
    },
  };
}

export async function setPayoutDestinationCore(
  supabase: ServiceRoleClient,
  userId: string,
  input: {
    campaignId: string;
    momoNumber: string;
    momoNetwork: string;
    holderName: string;
  },
): Promise<FieldOpsEnvelope<FieldOpsPayoutDestination>> {
  let membershipId: string;
  try {
    const ctx = await resolveFieldOpsContext(supabase, userId);
    membershipId = requireMembership(ctx, input.campaignId).membershipId;
  } catch (e) {
    return fieldOpsError(e);
  }

  // A batch that is already built or approved carries a snapshot of the old
  // number. Letting it change now would send money somewhere the approval
  // never covered.
  const { data: pending } = await supabase
    .from("fieldops_payout_item")
    .select("id, fieldops_payout_batch!inner(status)")
    .eq("member_id", membershipId)
    .eq("status", "pending")
    .in("fieldops_payout_batch.status", ["draft", "approved"])
    .limit(1);
  if ((pending ?? []).length > 0) {
    return {
      status: 409,
      message:
        "A payment to your current number is already being prepared. You can change this once it has been sent.",
    };
  }

  const { data, error } = await supabase
    .from("fieldops_team_member")
    .update({
      payout_momo_number: input.momoNumber,
      payout_momo_network: input.momoNetwork,
      payout_holder_name: input.holderName,
      payout_updated_at: new Date().toISOString(),
    } as never)
    .eq("id", membershipId)
    .select(
      "payout_momo_number, payout_momo_network, payout_holder_name, payout_updated_at",
    )
    .maybeSingle();
  if (error) return dbErr(error, "Could not save your payout details");
  logger.info(
    `fieldOps payout destination updated for membership ${membershipId}`,
  );

  return {
    status: 200,
    message: "Saved. Your earnings will be sent to this number.",
    data: {
      numberMasked: data?.payout_momo_number
        ? maskAccountNumber(data.payout_momo_number)
        : null,
      network: data?.payout_momo_network ?? null,
      holderName: data?.payout_holder_name ?? null,
      updatedAt: data?.payout_updated_at ?? null,
    },
  };
}
