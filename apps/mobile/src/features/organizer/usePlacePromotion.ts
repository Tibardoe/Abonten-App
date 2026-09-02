import { api } from "@/lib/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

// The per-place Promotion tab — tiers + current promotion, then a reserve
// step and the shared Paystack payment path (checkout.placePromotionAttempt
// -> payments.verify -> activatePlacePromotion). The place sibling of
// useEventPromotion; a place has no eligibility gate.

export function usePlacePromotionContext(placeId: string) {
  return useQuery({
    queryKey: ["mobile", "organizer", "place-promotion", placeId],
    queryFn: () => api.organizer.placePromotionContext(placeId),
    enabled: !!placeId,
    staleTime: 20_000,
  });
}

export function usePromotePlace() {
  return useMutation({
    mutationFn: (v: { placeId: string; tierId: number }) =>
      api.organizer.promotePlace(v.placeId, v.tierId),
  });
}

export function useCreatePlacePromotionAttempt() {
  return useMutation({
    mutationFn: (v: {
      placePromotionCheckoutId: string;
      paymentMethodId: string;
    }) => api.checkout.placePromotionAttempt(v),
  });
}

export function useInvalidatePlacePromotion() {
  const qc = useQueryClient();
  return (placeId: string) => {
    qc.invalidateQueries({
      queryKey: ["mobile", "organizer", "place-promotion", placeId],
    });
    qc.invalidateQueries({
      queryKey: ["mobile", "organizer", "places", placeId, "insights"],
    });
    qc.invalidateQueries({ queryKey: ["discovery"] });
    qc.invalidateQueries({ queryKey: ["explore"] });
    qc.invalidateQueries({ queryKey: ["mobile", "place", placeId] });
  };
}
