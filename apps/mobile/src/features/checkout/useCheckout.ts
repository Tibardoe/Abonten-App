import { api } from "@/lib/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

type ValidateInput = {
  eventId: string;
  quantities: Record<string, number>;
  occurrenceId?: string | null;
};

// Reserve inventory + open a pending checkout session. Mirrors the web
// validateCheckout action (promo codes not supported from the app yet).
export function useValidateCheckout() {
  return useMutation({
    mutationFn: (input: ValidateInput) => api.checkout.validate(input),
  });
}

// Authoritative amount owed for one pending session (subtotal / discount /
// service fee / total), re-read live server-side.
export function useCheckoutPrepare(checkoutSessionId: string | undefined) {
  return useQuery({
    queryKey: ["mobile", "checkout", "prepare", checkoutSessionId],
    enabled: !!checkoutSessionId,
    queryFn: () => api.checkout.prepare([checkoutSessionId as string]),
  });
}

export function useCheckoutSession(checkoutSessionId: string | undefined) {
  return useQuery({
    queryKey: ["mobile", "checkout", "session", checkoutSessionId],
    enabled: !!checkoutSessionId,
    queryFn: () => api.checkout.getSession(checkoutSessionId as string),
  });
}

export function useCancelCheckout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (checkoutSessionId: string) =>
      api.checkout.cancel(checkoutSessionId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["mobile", "checkout"] });
    },
  });
}

// The "resume checkout" basket — every active, non-expired pending session
// across all of the user's events. Mirrors the web PendingCheckoutsBasket.
// Self-heals expiry server-side, so a `refetch()` after a countdown hits
// zero drops the stale session.
export function usePendingCheckouts() {
  return useQuery({
    queryKey: ["mobile", "checkout", "pending"],
    queryFn: () => api.checkout.pending(),
    staleTime: 30_000,
  });
}
