import { api } from "@/lib/api";
import type {
  AddPayoutAccountBody,
  RequestPayoutBody,
} from "@abonten/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

const ACCOUNTS_KEY = ["mobile", "organizer", "payout-accounts"] as const;
const PAYOUTS_KEY = ["mobile", "organizer", "payouts"] as const;
const FINANCE_KEY = ["mobile", "organizer", "finance"] as const;
const OVERVIEW_KEY = ["mobile", "organizer", "overview"] as const;
const EVENTS_KEY = ["mobile", "organizer", "events"] as const;

export function usePayoutAccounts() {
  return useQuery({
    queryKey: ACCOUNTS_KEY,
    queryFn: () => api.organizer.payoutAccounts(),
  });
}

export function usePayouts() {
  return useQuery({
    queryKey: PAYOUTS_KEY,
    queryFn: () => api.organizer.payouts({ limit: 20 }),
  });
}

export function useAddPayoutAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: AddPayoutAccountBody) =>
      api.organizer.addPayoutAccount(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ACCOUNTS_KEY }),
  });
}

export function useRemovePayoutAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.organizer.removePayoutAccount(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ACCOUNTS_KEY }),
  });
}

export function useSetDefaultPayoutAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.organizer.setDefaultPayoutAccount(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ACCOUNTS_KEY }),
  });
}

export function useRequestPayout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: RequestPayoutBody) => api.organizer.requestPayout(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: PAYOUTS_KEY });
      qc.invalidateQueries({ queryKey: FINANCE_KEY });
      qc.invalidateQueries({ queryKey: OVERVIEW_KEY });
    },
  });
}

export function useEventCancellationImpact(eventId: string, enabled = true) {
  return useQuery({
    queryKey: ["mobile", "organizer", "cancellation-impact", eventId],
    queryFn: () => api.organizer.eventCancellationImpact(eventId),
    enabled: enabled && !!eventId,
  });
}

export function useCancelEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (eventId: string) => api.organizer.cancelEvent(eventId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: EVENTS_KEY });
      qc.invalidateQueries({ queryKey: FINANCE_KEY });
      qc.invalidateQueries({ queryKey: OVERVIEW_KEY });
    },
  });
}
