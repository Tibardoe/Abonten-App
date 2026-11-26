"use client";

import { supabase } from "@/config/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";

// Web echo of apps/mobile/src/features/places/usePlaceClaim.ts's
// usePlaceClaimState. `place_claim_request` has claimant-scoped RLS
// (place_claim_request_claimant_select, auth.uid() = claimant_id), so
// reading back the caller's own claim status runs straight from the
// browser client, same as mobile — no Server Action needed for this one.
//
// Before this hook existed, ClaimPlaceButton had no "you already have a
// pending claim" state at all: closing and reopening the modal (or
// reloading the page) always re-offered "Claim this Place", and a
// resubmission attempt was only ever stopped by the DB's unique-constraint
// 409 in submitPlaceClaimRequest.ts, not by the UI.

export type PlaceClaimState = {
  /** The caller's most recent claim on this place, if any. */
  status: "none" | "pending" | "approved" | "rejected";
  /** When staff decided it (placeClaimInvite's wait after a refusal). */
  reviewedAt: string | null;
  /** Signed-in, not the owner, and no pending/approved claim already. */
  canClaim: boolean;
};

async function fetchClaimState(
  userId: string | undefined,
  placeId: string,
  ownerId: string | null | undefined,
): Promise<PlaceClaimState> {
  if (!userId) return { status: "none", reviewedAt: null, canClaim: false };
  if (ownerId && userId === ownerId) {
    return { status: "none", reviewedAt: null, canClaim: false };
  }

  const { data, error } = await supabase
    .from("place_claim_request")
    .select("status, created_at, reviewed_at")
    .eq("place_id", placeId)
    .eq("claimant_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  // Not known is not "no request": the page offers nothing until it is.
  if (error) throw error;

  const status =
    (data?.status as PlaceClaimState["status"] | undefined) ?? "none";
  // A rejected claimant may re-request; a pending/approved one may not.
  const canClaim = status !== "pending" && status !== "approved";
  return { status, reviewedAt: data?.reviewed_at ?? null, canClaim };
}

export function placeClaimStateKey(
  placeId: string | undefined,
  userId: string | undefined,
) {
  return ["place-claim", placeId, userId] as const;
}

export function usePlaceClaimState(
  placeId: string | undefined,
  userId: string | undefined,
  ownerId: string | null | undefined,
) {
  return useQuery({
    queryKey: placeClaimStateKey(placeId, userId),
    enabled: !!placeId,
    queryFn: () => fetchClaimState(userId, placeId as string, ownerId),
  });
}

export function useInvalidatePlaceClaimState() {
  const qc = useQueryClient();
  return (placeId: string | undefined, userId: string | undefined) =>
    qc.invalidateQueries({ queryKey: placeClaimStateKey(placeId, userId) });
}
