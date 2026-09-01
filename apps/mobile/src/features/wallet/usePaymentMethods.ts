import { api } from "@/lib/api";
import type { AddMomoWalletBody } from "@abonten/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as WebBrowser from "expo-web-browser";

const KEY = ["mobile", "payment-methods"] as const;

type AddCardResult = { status: number; message?: string };

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

// Native echo of the web AddBankCard flow. Paystack can't tokenise a card
// without a real charge: initCard() opens a GHS 1 `card`-channel checkout in
// a browser session; when it closes we call confirmCard(reference), which
// verifies the charge server-side, captures the reusable authorization,
// refunds the GHS 1, and saves the card. The browser won't auto-close (the
// Paystack callback is a web URL, not the app scheme), so the user closes
// it manually and confirmCard is the source of truth either way.
export function useAddCard() {
  const qc = useQueryClient();
  return useMutation<AddCardResult, Error, string | undefined>({
    mutationFn: async (label) => {
      const init = await api.paymentMethods.initCard();
      if (init.status !== 200 || !init.data) {
        return {
          status: init.status,
          message: init.message ?? "Couldn't start card verification.",
        };
      }

      await WebBrowser.openAuthSessionAsync(
        init.data.authorizationUrl,
        "abonten://wallet",
      );

      const confirm = await api.paymentMethods.confirmCard(
        init.data.reference,
        label,
      );
      return { status: confirm.status, message: confirm.message };
    },
    onSuccess: (res) => {
      if (res.status === 200) qc.invalidateQueries({ queryKey: KEY });
    },
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
