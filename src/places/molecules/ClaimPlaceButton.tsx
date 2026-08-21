"use client";

import { useCurrentUser } from "@/hooks/useCurrentUser";
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
 */
export default function ClaimPlaceButton({
  placeId,
  placeName,
  ownerId,
}: ClaimPlaceButtonProps) {
  const { data: user } = useCurrentUser();
  const [showModal, setShowModal] = useState(false);

  if (!user || user.id === ownerId) return null;

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
        />
      )}
    </>
  );
}
