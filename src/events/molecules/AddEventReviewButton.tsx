"use client";

import { Button } from "@/components/ui/button";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useState } from "react";
import EventReviewModal from "../organisms/EventReviewModal";

type AddEventReviewButtonProps = {
  eventId: string;
  // Compared against the signed-in user so an organizer can't review their
  // own event -- mirrors AddPlaceReviewButton.tsx; postEventReview.ts
  // re-enforces both this and the attendance requirement server-side.
  organizerId: string;
};

export default function AddEventReviewButton({
  eventId,
  organizerId,
}: AddEventReviewButtonProps) {
  const [showReviewModal, setShowReviewModal] = useState(false);

  const { data: user } = useCurrentUser();

  if (!user || user.id === organizerId) return null;

  return (
    <>
      {showReviewModal && (
        <EventReviewModal
          eventId={eventId}
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
