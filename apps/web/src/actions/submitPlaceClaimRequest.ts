"use server";

import { createClient } from "@/config/supabase/server";
import { logger } from "@abonten/core/logger";

// Postgres error code for a unique-constraint violation.
const UNIQUE_VIOLATION = "23505";

type SubmitPlaceClaimRequestInput = {
  placeId: string;
  note?: string;
  contactPhone?: string;
  contactEmail?: string;
};

/**
 * Submits a request to claim ownership of a place from its current owner.
 * This never transfers ownership itself -- it only inserts a pending
 * place_claim_request row. Ownership only ever changes via an admin
 * approval (reviewPlaceClaimRequest.ts calling the approve_place_claim
 * RPC). This is the inverse of updatePlace.ts's ownership check: a
 * claimant is explicitly NOT the current owner, so this blocks the request
 * if they already are one. The partial unique index
 * (idx_place_claim_request_one_pending) is what actually enforces "one
 * pending request per (place, claimant)" -- a duplicate attempt surfaces
 * here as a friendly 409, same translation pattern postPlaceReview.ts uses
 * for its own unique-constraint violation.
 */
export async function submitPlaceClaimRequest(
  formData: SubmitPlaceClaimRequestInput,
) {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    return {
      status: 500,
      message: `Error fetching user: ${userError.message}`,
    };
  }

  if (!user) {
    return { status: 401, message: "User not authenticated" };
  }

  const { placeId, note, contactPhone, contactEmail } = formData;

  const { data: existingPlace, error: fetchError } = await supabase
    .from("place")
    .select("id, owner_id")
    .eq("id", placeId)
    .maybeSingle();

  if (fetchError) {
    return {
      status: 500,
      message: `Error fetching place: ${fetchError.message}`,
    };
  }

  if (!existingPlace) {
    return { status: 404, message: "Place not found" };
  }

  if (existingPlace.owner_id === user.id) {
    return { status: 400, message: "You already own this place" };
  }

  const { error: insertError } = await supabase
    .from("place_claim_request")
    .insert({
      place_id: placeId,
      claimant_id: user.id,
      note: note ?? null,
      contact_phone: contactPhone ?? null,
      contact_email: contactEmail ?? null,
      status: "pending",
    });

  if (insertError) {
    if (insertError.code === UNIQUE_VIOLATION) {
      return {
        status: 409,
        message: "You already have a pending claim request for this place.",
      };
    }

    logger.error(`Error inserting place claim request: ${insertError.message}`);
    return { status: 500, message: "Something went wrong!" };
  }

  return { status: 200, message: "Claim request submitted successfully!" };
}
