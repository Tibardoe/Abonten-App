"use client";

import { Button } from "@/components/ui/button";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useState } from "react";
import PlaceReviewModal from "../organisms/PlaceReviewModal";

type AddPlaceReviewButtonProps = {
  placeId: string;
  // Compared against the signed-in user so an owner can't review their own
  // place -- mirrors the same check postPlaceReview.ts already enforces
  // server-side; this just avoids showing the button in the first place.
  ownerId: string;
};

export default function AddPlaceReviewButton({
  placeId,
  ownerId,
}: AddPlaceReviewButtonProps) {
  const [showReviewModal, setShowReviewModal] = useState(false);

  // Shared with Header/SideBar/etc. -- one cached fetch instead of each
  // component independently calling supabase.auth.getUser().
  const { data: user } = useCurrentUser();

  if (!user || user.id === ownerId) return null;

  return (
    <>
      {showReviewModal && (
        <PlaceReviewModal
          placeId={placeId}
          handleShowReviewModal={setShowReviewModal}
        />
      )}

      <Button
        className="p-3 rounded-md font-semibold"
        onClick={() => setShowReviewModal(true)}
      >
        Add Review
      </Button>
    </>
  );
}
