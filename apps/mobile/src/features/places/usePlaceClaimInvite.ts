import { useSession } from "@/auth/SessionProvider";
import { usePlaceClaimState } from "@/features/places/usePlaceClaim";
import { useActingTeams } from "@/features/teams/useTeams";
import {
  type PlaceClaimInvite,
  type PlaceClaimOwnerRef,
  placeClaimInvite,
} from "@abonten/core/placeClaimInvite";

/**
 * What the place screen shows this person about claiming the place
 * (@abonten/core/placeClaimInvite, the same rule as the website): the
 * claim card only where nobody runs the place, "I own this business" in
 * the ⋯ menu where someone does, "pending" for their own waiting request,
 * and nothing for the owner and their team.
 */
export function usePlaceClaimInvite(
  place:
    | {
        id: string;
        owner_id: string | null;
        claimed?: boolean | null;
        owner?: PlaceClaimOwnerRef;
      }
    | null
    | undefined,
): {
  invite: PlaceClaimInvite;
  /** The person owns the place or is in the team that does. */
  runsPlace: boolean;
} {
  const { session } = useSession();
  const userId = session?.user.id;
  const claimQuery = usePlaceClaimState(
    userId ? place?.id : undefined,
    place?.owner_id,
  );
  const acting = useActingTeams();
  // useActingTeams answers [] before its read lands; the read's own state
  // says whether the list is known.
  const teamIds = acting.loaded ? acting.teams.map((team) => team.id) : null;

  if (!place) return { invite: { kind: "none" }, runsPlace: false };

  const subject = {
    ownerId: place.owner_id,
    claimed: place.claimed,
    owner: place.owner,
  };

  if (!userId) {
    return {
      invite: placeClaimInvite(subject, { signedIn: false }),
      runsPlace: false,
    };
  }

  const claim = claimQuery.data;
  return {
    invite: placeClaimInvite(subject, {
      signedIn: true,
      userId,
      teamIds,
      claim: claim
        ? { status: claim.status, reviewedAt: claim.reviewedAt }
        : undefined,
    }),
    runsPlace:
      !!place.owner_id &&
      (place.owner_id === userId || !!teamIds?.includes(place.owner_id)),
  };
}
