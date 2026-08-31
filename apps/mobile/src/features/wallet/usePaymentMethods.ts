import { api } from "@/lib/api";
import type { AddMomoWalletBody } from "@abonten/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

const KEY = ["mobile", "payment-methods"] as const;

export function usePaymentMethods() {
  return useQuery({
    queryKey: KEY,
    queryFn: () => api.paymentMethods.list(),
  });
}

// Mobile money networks change rarely — cache hard.
export function useMomoNetworks() {
  return useQuery({
    queryKey: ["mobile", "momo-networks"],
    queryFn: () => api.paystack.momoNetworks(),
    staleTime: 1000 * 60 * 60,
  });
}

export function useAddMomoWallet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Omit<AddMomoWalletBody, "type">) =>
      api.paymentMethods.addMomo({ type: "momo", ...body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useRemovePaymentMethod() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.paymentMethods.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useSetDefaultPaymentMethod() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.paymentMethods.setDefault(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
