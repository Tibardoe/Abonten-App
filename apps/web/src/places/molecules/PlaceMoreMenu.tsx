"use client";

import { ReportDialog } from "@/components/organisms/ReportDialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { usePlaceClaimInvite } from "@/hooks/usePlaceClaimInvite";
import { useInvalidatePlaceClaimState } from "@/hooks/usePlaceClaimState";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import ClaimPlaceModal from "@/places/organisms/ClaimPlaceModal";
import type { PlaceClaimOwnerRef } from "@abonten/core/placeClaimInvite";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { IoEllipsisHorizontal } from "react-icons/io5";

type PlaceMoreMenuProps = {
  placeId: string;
  placeName: string;
  ownerId: string;
  claimed: boolean | null | undefined;
  owner: PlaceClaimOwnerRef;
  className?: string;
};

/**
 * The "…" on a place's cover photo: "Report this place" for a signed-in
 * visitor who does not run it, and, on a place someone runs, the quiet
 * "I own this business" (@abonten/core/placeClaimInvite). That opens the
 * claim form worded as an ownership dispute: another account manages the
 * place, send proof, staff review it and nothing changes meanwhile.
 * Signed out, only "I own this business" is offered, and it signs in
 * first. With nothing to offer there is no "…".
 */
export default function PlaceMoreMenu({
  placeId,
  placeName,
  ownerId,
  claimed,
  owner,
  className,
}: PlaceMoreMenuProps) {
  const t = useTranslations("places");

  const { invite, userId, runsPlace } = usePlaceClaimInvite({
    placeId,
    ownerId,
    claimed,
    owner,
  });
  const invalidateClaimState = useInvalidatePlaceClaimState();
  const requireAuth = useRequireAuth();
  const [reportOpen, setReportOpen] = useState(false);
  const [disputeOpen, setDisputeOpen] = useState(false);

  // The owner and their team report nothing here.
  const canReport = !!userId && !runsPlace;
  const canDispute = invite.kind === "dispute";

  return (
    <>
      {canReport || canDispute ? (
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label={t("placeMoreOptions", { name: placeName })}
            className={
              className ??
              "inline-flex items-center rounded-full p-1 text-white/80 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
            }
          >
            <IoEllipsisHorizontal className="text-lg md:text-xl" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            {canReport ? (
              <DropdownMenuItem onSelect={() => setReportOpen(true)}>
                {t("reportThisPlace")}
              </DropdownMenuItem>
            ) : null}
            {canDispute ? (
              <DropdownMenuItem
                onSelect={async () => {
                  if (await requireAuth()) setDisputeOpen(true);
                }}
              >
                {t("iOwnThisBusiness")}
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}

      {reportOpen ? (
        <ReportDialog
          open
          onOpenChange={setReportOpen}
          targetType="place"
          targetId={placeId}
          targetLabel={placeName}
        />
      ) : null}

      {disputeOpen ? (
        <ClaimPlaceModal
          placeId={placeId}
          placeName={placeName}
          mode="dispute"
          retryAfter={invite.kind === "dispute" ? invite.retryAfter : null}
          onClose={() => setDisputeOpen(false)}
          onSubmitted={() => invalidateClaimState(placeId, userId ?? undefined)}
        />
      ) : null}
    </>
  );
}
