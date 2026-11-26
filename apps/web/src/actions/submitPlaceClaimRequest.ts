"use server";

import { createClient } from "@/config/supabase/server";
import { withActionLocale } from "@/i18n/withActionLocale";
import { formatDate } from "@abonten/core/i18n/format";
import { logger } from "@abonten/core/logger";
import {
  DISPUTE_NOTE_MIN_LENGTH,
  placeClaimRefusal,
  placeStewardship,
} from "@abonten/core/placeClaimInvite";
import { PLACE_OWNER_EMBED } from "@abonten/core/placeOwner";
import { userFacingError } from "@abonten/core/userFacingError";
import { requestLocale, tr } from "@abonten/services/i18n/requestLocale";
import { checkRateLimit } from "@abonten/services/security/rateLimit";

// The partial unique index stops a duplicate pending request for the SAME
// place, but not a burst of claims across many different places, each of
// which needs a human (owner/admin) to eventually review.
const MAX_CLAIM_REQUESTS_PER_HOUR = 5;

type SubmitPlaceClaimRequestInput = {
  placeId: string;
  note?: string;
  contactPhone?: string;
  contactEmail?: string;
};

/**
 * Submits a request to claim ownership of a place from its current owner.
 * This never transfers ownership itself -- it only inserts a pending
 * place_claim_request row (as the claimant, under its insert rule; the
 * app inserts the same row directly). Ownership only ever changes via an
 * admin approval (Admin › Claims calling the approve_place_claim RPC).
 *
 * What the database refuses (migration 20261126140000,
 * place_claim_request_guard, and the one-pending-request index
 * idx_place_claim_request_one_pending) comes back as a friendly message:
 * a request already waiting, one from someone who already runs the place
 * (its owner, or a member of the team that owns it), and an ownership
 * dispute from someone whose last request for the same place staff turned
 * down less than 30 days ago. A dispute (someone else runs the place) must
 * say how the business is the claimant's.
 *
 * Answers the new request's id, so the form can upload its documents.
 */
export const submitPlaceClaimRequest = withActionLocale(
  async function submitPlaceClaimRequest(
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
        message: userFacingError("Error fetching user", userError),
      };
    }

    if (!user) {
      return { status: 401, message: tr("userNotAuthenticated") };
    }

    const allowed = await checkRateLimit(
      `place-claim:${user.id}`,
      MAX_CLAIM_REQUESTS_PER_HOUR,
      3600,
    );

    if (!allowed) {
      return {
        status: 429,
        message: tr("tooManyClaimRequestsRecentlyPlease"),
      };
    }

    const { placeId, note, contactPhone, contactEmail } = formData;

    const { data: existingPlace, error: fetchError } = await supabase
      .from("place")
      .select(`id, owner_id, claimed, ${PLACE_OWNER_EMBED}`)
      .eq("id", placeId)
      .maybeSingle();

    if (fetchError) {
      return {
        status: 500,
        message: userFacingError("Error fetching place", fetchError),
      };
    }

    if (!existingPlace) {
      return { status: 404, message: tr("placeNotFound") };
    }

    if (existingPlace.owner_id === user.id) {
      return { status: 400, message: tr("youAlreadyOwnThisPlace") };
    }

    // Someone else runs it: an ownership dispute, which staff can only
    // weigh with an explanation.
    const stewardship = placeStewardship({
      ownerId: existingPlace.owner_id,
      claimed: existingPlace.claimed,
      owner: existingPlace.owner,
    });
    if (
      stewardship === "owner" &&
      (note?.trim().length ?? 0) < DISPUTE_NOTE_MIN_LENGTH
    ) {
      return { status: 400, message: tr("tellUsHowTheBusinessIsYours") };
    }

    const { data: inserted, error: insertError } = await supabase
      .from("place_claim_request")
      .insert({
        place_id: placeId,
        claimant_id: user.id,
        note: note ?? null,
        contact_phone: contactPhone ?? null,
        contact_email: contactEmail ?? null,
        status: "pending",
      })
      .select("id")
      .single();

    if (insertError) {
      const refusal = placeClaimRefusal(insertError);
      if (refusal === "pending") {
        return {
          status: 409,
          message: tr("youAlreadyHaveAPendingClaim"),
        };
      }
      if (refusal === "runs_place") {
        return { status: 400, message: tr("youAlreadyManageThisPlace") };
      }
      if (refusal === "dispute_wait") {
        return {
          status: 409,
          message: tr("disputeTooSoon", {
            date: formatDate(insertError.details, requestLocale()),
          }),
        };
      }

      logger.error(
        `Error inserting place claim request: ${insertError.message}`,
      );
      return { status: 500, message: tr("somethingWentWrong") };
    }

    return {
      status: 200,
      message: tr("claimRequestSubmittedSuccessfully"),
      data: { claimId: inserted.id as string },
    };
  },
);
