import { useSession } from "@/auth/SessionProvider";
import { supabase } from "@/lib/supabase";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

// Native echo of the web submitPlaceClaimRequest action + getPlaceClaimRequests
// (claimant view). `place_claim_request` has claimant-scoped RLS
// (place_claim_request_claimant_insert / _claimant_select,
// auth.uid() = claimant_id), so submitting a claim and reading back the
// caller's own claim status both run straight from the client — no
// /api/mobile endpoint. Ownership NEVER changes here; only an admin approval
// on web (approve_place_claim RPC) does that. The partial unique index
// idx_place_claim_request_one_pending is the backstop against duplicate
// pending claims (surfaces as Postgres 23505).

export type PlaceClaimState = {
  /** The caller's most recent claim on this place, if any. */
  status: "none" | "pending" | "approved" | "rejected";
  /** Signed-in, not the owner, and no pending/approved claim already. */
  canClaim: boolean;
};

async function fetchClaimState(
  userId: string | undefined,
  placeId: string,
  ownerId: string | null | undefined,
): Promise<PlaceClaimState> {
  if (!userId) return { status: "none", canClaim: false };
  if (ownerId && userId === ownerId) return { status: "none", canClaim: false };

  const { data } = await supabase
    .from("place_claim_request")
    .select("status, created_at")
    .eq("place_id", placeId)
    .eq("claimant_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const status =
    (data?.status as PlaceClaimState["status"] | undefined) ?? "none";
  // A rejected claimant may re-request; a pending/approved one may not.
  const canClaim = status !== "pending" && status !== "approved";
  return { status, canClaim };
}

export function usePlaceClaimState(
  placeId: string | undefined,
  ownerId: string | null | undefined,
) {
  const { session } = useSession();
  const userId = session?.user.id;
  return useQuery({
    queryKey: ["mobile", "place-claim", placeId, userId],
    enabled: !!placeId,
    queryFn: () => fetchClaimState(userId, placeId as string, ownerId),
  });
}

export function useSubmitPlaceClaim(placeId: string | undefined) {
  const qc = useQueryClient();
  const { session } = useSession();
  const userId = session?.user.id;

  return useMutation({
    mutationFn: async (input: {
      note?: string;
      contactPhone?: string;
      contactEmail?: string;
    }) => {
      if (!userId) throw new Error("Not signed in");
      if (!placeId) throw new Error("Missing place");
      const { error } = await supabase.from("place_claim_request").insert({
        place_id: placeId,
        claimant_id: userId,
        note: input.note?.trim() || null,
        contact_phone: input.contactPhone?.trim() || null,
        contact_email: input.contactEmail?.trim() || null,
        status: "pending",
      });
      if (error) {
        if (error.code === "23505")
          throw new Error(
            "You already have a pending claim request for this place.",
          );
        throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: ["mobile", "place-claim", placeId, userId],
      });
    },
  });
}
