import { api } from "@/lib/api";
import type { UpdatePromoCodeBody } from "@abonten/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

// Per-event promo-code management — mirrors the web ManagePromoCodesModal
// (list + edit terms + delete/deactivate). New codes are only created in
// the event wizard's Promos step, so there is no "add" here.

const KEY = ["mobile", "organizer", "promo-codes"] as const;

export function useEventPromoCodes(eventId: string) {
  return useQuery({
    queryKey: [...KEY, eventId],
    queryFn: () => api.organizer.eventPromoCodes(eventId),
    enabled: !!eventId,
    staleTime: 20_000,
  });
}

export function useUpdatePromoCode(eventId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdatePromoCodeBody) =>
      api.organizer.updatePromoCode(body),
    onSuccess: () => invalidate(qc, eventId),
  });
}

export function useDeletePromoCode(eventId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (promoCodeId: string) =>
      api.organizer.deletePromoCode(promoCodeId),
    onSuccess: () => invalidate(qc, eventId),
  });
}

function invalidate(
  qc: ReturnType<typeof useQueryClient>,
  eventId: string,
): void {
  qc.invalidateQueries({ queryKey: [...KEY, eventId] });
  // The Insights "Promo Codes" section reads a separate analytics source,
  // but a deactivation / discount change should still show up there.
  qc.invalidateQueries({
    queryKey: ["mobile", "organizer", "event-insights", eventId],
  });
}
