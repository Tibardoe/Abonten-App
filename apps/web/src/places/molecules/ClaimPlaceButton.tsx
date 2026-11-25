"use client";

import { useCurrentUser } from "@/hooks/useCurrentUser";
import {
  useInvalidatePlaceClaimState,
  usePlaceClaimState,
} from "@/hooks/usePlaceClaimState";
import ClaimPlaceModal from "@/places/organisms/ClaimPlaceModal";
import { useTranslations } from "next-intl";
import { useState } from "react";

type ClaimPlaceButtonProps = {
  placeId: string;
  placeName: string;
  ownerId: string;
  /**
   * "overlay" (default) sits on the cover photo; "inline" is the button in
   * the page's actions where Message was, for a place nobody manages.
   */
  variant?: "overlay" | "inline";
};

const VARIANT_CLASS = {
  overlay: {
    pending:
      "px-3 py-1.5 bg-black/20 backdrop-blur-sm rounded-full text-white text-xs md:text-sm shrink-0",
    button:
      "px-3 py-1.5 bg-black/20 backdrop-blur-sm rounded-full text-white text-xs md:text-sm hover:bg-black/30 transition-colors shrink-0",
  },
  inline: {
    pending: "text-sm text-muted-foreground shrink-0",
    button:
      "px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors shrink-0",
  },
} as const;

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
  variant = "overlay",
}: ClaimPlaceButtonProps) {
  const t = useTranslations("places");
  const classes = VARIANT_CLASS[variant];

  const { data: user } = useCurrentUser();
  const { data: claimState } = usePlaceClaimState(placeId, user?.id, ownerId);
  const invalidateClaimState = useInvalidatePlaceClaimState();
  const [showModal, setShowModal] = useState(false);

  if (!user || user.id === ownerId) return null;

  if (claimState?.status === "pending") {
    return <span className={classes.pending}>{t("claimPendingReview")}</span>;
  }

  if (claimState?.status === "approved") return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setShowModal(true)}
        className={classes.button}
      >
        {t("claimThisPlace")}
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
