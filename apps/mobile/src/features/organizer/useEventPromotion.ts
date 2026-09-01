import { api } from "@/lib/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

// The per-event Promotion tab — tiers + current promotion + eligibility,
// then a reserve step and the shared Paystack payment path
// (checkout.promotionAttempt -> payments.verify -> activateEventPromotion).

export function useEventPromotionContext(eventId: string) {
  return useQuery({
    queryKey: ["mobile", "organizer", "event-promotion", eventId],
    queryFn: () => api.organizer.eventPromotionContext(eventId),
    enabled: !!eventId,
    staleTime: 20_000,
  });
}

export function usePromoteEvent() {
  return useMutation({
    mutationFn: (v: { eventId: string; tierId: number }) =>
      api.organizer.promoteEvent(v.eventId, v.tierId),
  });
}

export function useCreatePromotionAttempt() {
  return useMutation({
    mutationFn: (v: {
      eventPromotionCheckoutId: string;
      paymentMethodId: string;
    }) => api.checkout.promotionAttempt(v),
  });
}

export function useInvalidateEventPromotion() {
  const qc = useQueryClient();
  return (eventId: string) => {
    qc.invalidateQueries({
      queryKey: ["mobile", "organizer", "event-promotion", eventId],
    });
    qc.invalidateQueries({ queryKey: ["discovery"] });
    qc.invalidateQueries({ queryKey: ["explore"] });
  };
}
