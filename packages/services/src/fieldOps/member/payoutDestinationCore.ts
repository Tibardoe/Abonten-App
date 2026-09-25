import { logger } from "@abonten/core/logger";
import { maskAccountNumber } from "@abonten/core/maskAccountNumber";
import {
  PHONE_ERROR_MESSAGE,
  dialCodeFor,
  parsePhoneWithDialCode,
} from "@abonten/core/phone/phone";
import type { FieldOpsPayoutDestination } from "@abonten/types/fieldOps";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import { getMarketOrDefault } from "../../markets/marketConfig";
import { listMobileMoneyNetworksCore } from "../../payments/mobileMoneyNetworksCore";
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

/** The campaign region's country: its dial code and mobile money networks. */
async function campaignCountry(
  supabase: ServiceRoleClient,
  regionId: string,
): Promise<{ countryCode: string; dialCode: string; networks: string[] }> {
  const { data } = await supabase
    .from("fieldops_region")
    .select("country_code")
    .eq("id", regionId)
    .maybeSingle();
  const market = await getMarketOrDefault(data?.country_code ?? null);
  const countryCode = (data?.country_code ?? market.countryCode).toUpperCase();
  const listed = await listMobileMoneyNetworksCore(countryCode).catch(
    () => null,
  );
  return {
    countryCode,
    dialCode: dialCodeFor(countryCode) ?? market.dialCode,
    networks:
      listed && listed.status === 200
        ? listed.data.networks.map((n) => n.name)
        : [],
  };
}

export async function getPayoutDestinationCore(
  supabase: ServiceRoleClient,
  userId: string,
  input: { campaignId: string },
): Promise<FieldOpsEnvelope<FieldOpsPayoutDestination>> {
  let membershipId: string;
  let regionId: string;
  try {
    const ctx = await resolveFieldOpsContext(supabase, userId);
    ({ membershipId, regionId } = requireMembership(ctx, input.campaignId));
  } catch (e) {
    return fieldOpsError(e);
  }
  const country = await campaignCountry(supabase, regionId);
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
      availableNetworks: country.networks,
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
  let regionId: string;
  try {
    const ctx = await resolveFieldOpsContext(supabase, userId);
    ({ membershipId, regionId } = requireMembership(ctx, input.campaignId));
  } catch (e) {
    return fieldOpsError(e);
  }

  // The number is read in the campaign country's numbering plan (a
  // Ghanaian 024…, a Kenyan 0712…) and stored as E.164; the network must be
  // one that country's provider lists, when it lists any.
  const country = await campaignCountry(supabase, regionId);
  const phone = parsePhoneWithDialCode(country.dialCode, input.momoNumber);
  if (!phone.ok) {
    return { status: 400, message: PHONE_ERROR_MESSAGE[phone.error] };
  }
  if (phone.country && phone.country !== country.countryCode) {
    return {
      status: 400,
      message: "Use a mobile money number from the campaign's country.",
    };
  }
  if (
    country.networks.length > 0 &&
    !country.networks.some(
      (n) => n.toLowerCase() === input.momoNetwork.trim().toLowerCase(),
    )
  ) {
    return {
      status: 400,
      message: `Choose one of: ${country.networks.join(", ")}.`,
    };
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
      payout_momo_number: phone.e164,
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
      availableNetworks: country.networks,
    },
  };
}
