"use client";

import { useCurrentUser } from "@/hooks/useCurrentUser";
import {
  useInvalidatePlaceClaimState,
  usePlaceClaimState,
} from "@/hooks/usePlaceClaimState";
import ClaimPlaceModal from "@/places/organisms/ClaimPlaceModal";
import { useState } from "react";

type ClaimPlaceButtonProps = {
  placeId: string;
  placeName: string;
  ownerId: string;
};

/**
 * Entry point for the "Claim this Place" flow on the public details page --
 * visible only to a signed-in user who is NOT the current owner (the
 * inverse of updatePlace.ts's ownership check: a claimant isn't the
 * current owner by definition). Deliberately lives on the public details
 * page rather than /manage/places/[placeId] -- claiming is for a DIFFERENT
 * user who wants to take over from the current owner, not something the
 * owner does to their own place.
 *
 * Tracks the caller's own pending/approved claim state (usePlaceClaimState,
 * same RLS-scoped read pattern as the mobile app already used) so
 * re-opening the modal, or reloading the page, doesn't keep inviting a
 * duplicate submission that only the DB's unique constraint used to catch.
 */
export default function ClaimPlaceButton({
  placeId,
  placeName,
  ownerId,
}: ClaimPlaceButtonProps) {
  const { data: user } = useCurrentUser();
  const { data: claimState } = usePlaceClaimState(placeId, user?.id, ownerId);
  const invalidateClaimState = useInvalidatePlaceClaimState();
  const [showModal, setShowModal] = useState(false);

  if (!user || user.id === ownerId) return null;

  if (claimState?.status === "pending") {
    return (
      <span className="px-3 py-1.5 bg-black/20 backdrop-blur-sm rounded-full text-white text-xs md:text-sm shrink-0">
        Claim pending review
      </span>
    );
  }

  if (claimState?.status === "approved") return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setShowModal(true)}
        className="px-3 py-1.5 bg-black/20 backdrop-blur-sm rounded-full text-white text-xs md:text-sm hover:bg-black/30 transition-colors shrink-0"
      >
        Claim this Place
      </button>

      {showModal && (
        <ClaimPlaceModal
          placeId={placeId}
          placeName={placeName}
          onClose={() => setShowModal(false)}
          onSubmitted={() => invalidateClaimState(placeId, user.id)}
        />
      )}
    </>
  );
}
