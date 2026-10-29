import { api } from "@/lib/api";
import { settleEnvelope } from "@/lib/envelope";
import type {
  CreatePromoCodeBody,
  UpdatePromoCodeBody,
} from "@abonten/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

// Per-event promo-code management — mirrors the web ManagePromoCodesModal
// (list + add + edit terms + delete/deactivate).

const KEY = ["mobile", "organizer", "promo-codes"] as const;

export function useEventPromoCodes(eventId: string) {
  return useQuery({
    queryKey: [...KEY, eventId],
    queryFn: async () =>
      settleEnvelope(await api.organizer.eventPromoCodes(eventId)),
    enabled: !!eventId,
    staleTime: 20_000,
  });
}

export function useCreatePromoCode(eventId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreatePromoCodeBody) =>
      api.organizer.createPromoCode(eventId, body),
    onSuccess: (res) => {
      if (res.status === 200) invalidate(qc, eventId);
    },
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
