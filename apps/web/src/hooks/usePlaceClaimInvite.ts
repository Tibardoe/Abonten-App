"use client";

import { useCurrentUser } from "@/hooks/useCurrentUser";
import { usePlaceClaimState } from "@/hooks/usePlaceClaimState";
import { useActingContext } from "@/teams/useActingContext";
import {
  type PlaceClaimInvite,
  type PlaceClaimOwnerRef,
  placeClaimInvite,
} from "@abonten/core/placeClaimInvite";

export type PlaceClaimInviteInput = {
  placeId: string;
  ownerId: string;
  claimed: boolean | null | undefined;
  owner: PlaceClaimOwnerRef;
};

/**
 * What the place page shows this visitor about claiming the place
 * (@abonten/core/placeClaimInvite, the same rule as the app): the hero's
 * "Claim this place" and the "…" menu's "I own this business" both read
 * it. The visitor's own request and their teams are asked once and shared
 * by every caller (React Query).
 */
export function usePlaceClaimInvite(input: PlaceClaimInviteInput): {
  invite: PlaceClaimInvite;
  /** Undefined while the visitor is not known yet, null when signed out. */
  userId: string | null | undefined;
  /** The visitor owns the place or is in the team that does. */
  runsPlace: boolean;
} {
  const { data: user } = useCurrentUser();
  const signedIn = !!user;
  const { data: claimState } = usePlaceClaimState(
    signedIn ? input.placeId : undefined,
    user?.id,
    input.ownerId,
  );
  const acting = useActingContext(signedIn);

  const place = {
    ownerId: input.ownerId,
    claimed: input.claimed,
    owner: input.owner,
  };

  if (user === undefined) {
    return { invite: { kind: "none" }, userId: undefined, runsPlace: false };
  }
  if (user === null) {
    return {
      invite: placeClaimInvite(place, { signedIn: false }),
      userId: null,
      runsPlace: false,
    };
  }

  const teamIds = acting.isPending ? null : acting.teams.map((team) => team.id);
  return {
    invite: placeClaimInvite(place, {
      signedIn: true,
      userId: user.id,
      teamIds,
      claim: claimState
        ? { status: claimState.status, reviewedAt: claimState.reviewedAt }
        : undefined,
    }),
    userId: user.id,
    runsPlace: user.id === input.ownerId || !!teamIds?.includes(input.ownerId),
  };
}
