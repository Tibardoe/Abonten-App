"use client";

import { usePlaceClaimInvite } from "@/hooks/usePlaceClaimInvite";
import { useInvalidatePlaceClaimState } from "@/hooks/usePlaceClaimState";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import ClaimPlaceModal from "@/places/organisms/ClaimPlaceModal";
import type { PlaceClaimOwnerRef } from "@abonten/core/placeClaimInvite";
import { useTranslations } from "next-intl";
import { useState } from "react";

type ClaimPlaceButtonProps = {
  placeId: string;
  placeName: string;
  ownerId: string;
  claimed: boolean | null | undefined;
  owner: PlaceClaimOwnerRef;
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
 * The prominent "Claim this place", shown only where nobody real is behind
 * the place: its owner's account was deleted, or Abonten listed it and
 * nobody has claimed it (@abonten/core/placeClaimInvite). On a place
 * someone runs there is no button: the "…" menu's quiet "I own this
 * business" (PlaceMoreMenu) opens the same form as a dispute. The visitor's
 * own waiting request reads "Claim pending review"; the owner and their
 * team see nothing. Signed out, it signs in first and comes back here.
 */
export default function ClaimPlaceButton({
  placeId,
  placeName,
  ownerId,
  claimed,
  owner,
  variant = "overlay",
}: ClaimPlaceButtonProps) {
  const t = useTranslations("places");
  const classes = VARIANT_CLASS[variant];

  const { invite, userId } = usePlaceClaimInvite({
    placeId,
    ownerId,
    claimed,
    owner,
  });
  const invalidateClaimState = useInvalidatePlaceClaimState();
  const requireAuth = useRequireAuth();
  const [showModal, setShowModal] = useState(false);

  // The form stays open once sent: the request turning "pending" changes
  // the button, not the form's confirmation and uploads.
  const modal = showModal ? (
    <ClaimPlaceModal
      placeId={placeId}
      placeName={placeName}
      mode="claim"
      onClose={() => setShowModal(false)}
      onSubmitted={() => invalidateClaimState(placeId, userId ?? undefined)}
    />
  ) : null;

  if (invite.kind === "pending") {
    return (
      <>
        <span className={classes.pending}>{t("claimPendingReview")}</span>
        {modal}
      </>
    );
  }

  if (invite.kind !== "claim") return modal;

  return (
    <>
      <button
        type="button"
        onClick={async () => {
          if (await requireAuth()) setShowModal(true);
        }}
        className={classes.button}
      >
        {t("claimThisPlace")}
      </button>
      {modal}
    </>
  );
}
