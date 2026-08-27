"use server";

import { createClient } from "@/config/supabase/server";
import { logger } from "@/utils/logger";
import createNotification from "./createNotification";

type ReviewPlaceClaimRequestInput = {
  requestId: string;
  decision: "approve" | "reject";
};

/**
 * Admin-only review of a pending claim request. Re-checks
 * user_info.is_admin server-side itself (same reasoning as
 * getPlaceClaimRequests.ts). Approval delegates the actual owner_id
 * reassignment to the approve_place_claim RPC -- the only path that ever
 * writes place.owner_id (see the migration) -- which re-checks is_admin a
 * second time itself. Rejection is a plain status update (no RPC, no
 * ownership change), guarded by `.eq("status", "pending")` so two admins
 * racing to review the same request can't both "succeed". Note: the
 * status value written on rejection is 'rejected', not 'reject' -- the
 * migration's CHECK constraint only allows
 * pending/approved/rejected, so 'reject' would violate it; this corrects
 * what reads as a typo in the milestone spec against the actual schema
 * (source of truth per CLAUDE.md). Either outcome notifies the claimant via
 * createNotification.ts.
 */
export async function reviewPlaceClaimRequest(
  formData: ReviewPlaceClaimRequestInput,
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

  const { data: userInfo, error: userInfoError } = await supabase
    .from("user_info")
    .select("is_admin")
    .eq("id", user.id)
    .maybeSingle();

  if (userInfoError) {
    return {
      status: 500,
      message: `Error checking admin status: ${userInfoError.message}`,
    };
  }

  if (!userInfo?.is_admin) {
    return { status: 403, message: "Not authorized" };
  }

  const { requestId, decision } = formData;

  const { data: claimRequest, error: fetchError } = await supabase
    .from("place_claim_request")
    .select("id, place_id, claimant_id, status, place(name, slug)")
    .eq("id", requestId)
    .maybeSingle();

  if (fetchError) {
    return {
      status: 500,
      message: `Error fetching claim request: ${fetchError.message}`,
    };
  }

  if (!claimRequest) {
    return { status: 404, message: "Claim request not found" };
  }

  if (claimRequest.status !== "pending") {
    return {
      status: 409,
      message: "This claim request has already been reviewed.",
    };
  }

  const placeInfo = claimRequest.place as {
    name?: string;
    slug?: string;
  } | null;
  const placeName = placeInfo?.name ?? "the place";

  if (decision === "approve") {
    const { error: rpcError } = await supabase.rpc("approve_place_claim", {
      p_request_id: requestId,
      p_admin_id: user.id,
    });

    if (rpcError) {
      logger.error(`Error approving place claim: ${rpcError.message}`);

      const isAuthError = rpcError.message?.includes("Not authorized");
      return {
        status: isAuthError ? 403 : 409,
        message: isAuthError
          ? "Not authorized"
          : "This claim request could not be approved. It may have already been reviewed.",
      };
    }

    const notifyResult = await createNotification(
      {
        userId: claimRequest.claimant_id,
        type: "place_claim_approved",
        title: "Your claim was approved",
        body: `You now manage ${placeName}.`,
        link: `/manage/places/${claimRequest.place_id}`,
      },
      supabase,
    );

    if (notifyResult.status !== 200) {
      logger.error(
        `Failed to notify claimant of approval: ${notifyResult.message}`,
      );
    }

    return { status: 200, message: "Claim request approved." };
  }

  const { data: updatedRows, error: updateError } = await supabase
    .from("place_claim_request")
    .update({
      status: "rejected",
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", requestId)
    .eq("status", "pending")
    .select("id");

  if (updateError) {
    logger.error(`Error rejecting place claim: ${updateError.message}`);
    return { status: 500, message: "Something went wrong!" };
  }

  if (!updatedRows || updatedRows.length === 0) {
    return {
      status: 409,
      message: "This claim request has already been reviewed.",
    };
  }

  const notifyResult = await createNotification(
    {
      userId: claimRequest.claimant_id,
      type: "place_claim_rejected",
      title: "Your claim request was not approved",
      body: `Your request to claim ${placeName} was rejected.`,
      link: placeInfo?.slug ? `/places/${placeInfo.slug}` : null,
    },
    supabase,
  );

  if (notifyResult.status !== 200) {
    logger.error(
      `Failed to notify claimant of rejection: ${notifyResult.message}`,
    );
  }

  return { status: 200, message: "Claim request rejected." };
}
