import { usePaymentMethods } from "@/features/wallet/usePaymentMethods";
import { api } from "@/lib/api";
import type { PaymentMethodRow } from "@abonten/api-client";
import { AppText } from "@abonten/ui-native";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";

// How the buyer pays one order: a saved wallet entry, or a way to pay on
// the provider's page ("Card", "Bank transfer", "USSD"…). The order's
// market decides both lists — the server answers GET /payments/options
// from the listing's country and currency, so a Lagos event offers what
// Paystack Nigeria can take and a London one what Stripe can, without the
// app knowing either. Saved entries that can't pay there (a Ghanaian wallet
// for a Kenyan event) stay visible but can't be picked, with the reason.

export type PaymentTarget =
  | { kind: "ticket"; checkoutSessionIds: string[] }
  | { kind: "event" | "place" | "spotlight"; checkoutId: string };

export type PaymentChoice =
  | { paymentMethodId: string; method: null }
  | { paymentMethodId: null; method: string }
  | null;

function savedLabel(m: PaymentMethodRow): string {
  const d = m.details as Record<string, string>;
  return m.method_type === "momo"
    ? `${d.networkName ?? "Mobile money"} · ${d.phone ?? ""}`
    : `${d.brand ?? "Card"} ···· ${d.last4 ?? ""}`;
}

export function usePaymentChoice(target: PaymentTarget | null) {
  const { data: methodsRes } = usePaymentMethods();
  const saved = methodsRes?.status === 200 ? (methodsRes.data ?? []) : [];

  const key =
    target?.kind === "ticket"
      ? [...target.checkoutSessionIds].sort().join(",")
      : (target?.checkoutId ?? "");
  const options = useQuery({
    queryKey: ["payment-options", target?.kind ?? null, key],
    queryFn: () =>
      target ? api.paymentsCatalog.options(target) : Promise.resolve(null),
    enabled: !!target && key.length > 0,
    staleTime: 30_000,
  });
  const data = options.data?.status === 200 ? options.data.data : null;
  const hosted = data?.methods ?? [];
  const usableIds = new Set(
    (data?.saved ?? []).filter((s) => s.usable).map((s) => s.id),
  );
  const reasonFor = (id: string) =>
    data?.saved.find((s) => s.id === id)?.reason ?? null;
  // Until the answer arrives the wallet is shown as it always was.
  const isUsable = (id: string) => (data ? usableIds.has(id) : true);

  const [savedId, setSavedId] = useState<string | null>(null);
  const [method, setMethod] = useState<string | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: choose a default once the wallet or the options change.
  useEffect(() => {
    if (savedId && isUsable(savedId)) return;
    if (method) return;
    const usable = saved.filter((m) => isUsable(m.id));
    const fallback = usable.find((m) => m.is_default) ?? usable[0];
    if (fallback) {
      setSavedId(fallback.id);
      return;
    }
    if (savedId) setSavedId(null);
    const recommended = hosted.find((m) => m.recommended) ?? hosted[0];
    if (recommended) setMethod(recommended.method);
  }, [saved.length, data]);

  const choice: PaymentChoice = savedId
    ? { paymentMethodId: savedId, method: null }
    : method
      ? { paymentMethodId: null, method }
      : null;

  return {
    saved,
    hosted,
    choice,
    isUsable,
    reasonFor,
    transacting: data ? data.transacting : true,
    marketName: data?.marketName ?? null,
    selectSaved: (id: string) => {
      setSavedId(id);
      setMethod(null);
    },
    selectMethod: (code: string) => {
      setMethod(code);
      setSavedId(null);
    },
  };
}

export function PaymentChoiceList({
  state,
}: {
  state: ReturnType<typeof usePaymentChoice>;
}) {
  const { saved, hosted, choice, isUsable, reasonFor } = state;
  return (
    <View className="gap-2">
      {saved.map((m) => {
        const usable = isUsable(m.id);
        const selected = choice?.paymentMethodId === m.id;
        const reason = usable ? null : reasonFor(m.id);
        return (
          <Pressable
            accessibilityRole="radio"
            accessibilityState={{ selected, disabled: !usable }}
            key={m.id}
            disabled={!usable}
            onPress={() => state.selectSaved(m.id)}
            className={`rounded-xl border p-3 ${
              selected ? "border-primary bg-accent" : "border-border bg-card"
            } ${usable ? "" : "opacity-60"}`}
          >
            <View className="flex-row items-center justify-between">
              <AppText className="text-sm text-foreground">
                {savedLabel(m)}
              </AppText>
              {selected ? (
                <AppText variant="small" tone="brand" className="font-semibold">
                  ✓
                </AppText>
              ) : null}
            </View>
            {reason ? (
              <AppText variant="small" tone="muted" className="mt-1">
                {reason}
              </AppText>
            ) : null}
          </Pressable>
        );
      })}
      {hosted.length > 0 ? (
        <AppText variant="small" tone="muted" className="mt-1">
          {saved.length > 0 ? "Or pay another way" : "Ways to pay"}
        </AppText>
      ) : null}
      {hosted.map((m) => {
        const selected = choice?.method === m.method;
        return (
          <Pressable
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            key={`${m.provider}:${m.method}`}
            onPress={() => state.selectMethod(m.method)}
            className={`flex-row items-center justify-between rounded-xl border p-3 ${
              selected ? "border-primary bg-accent" : "border-border bg-card"
            }`}
          >
            <AppText className="text-sm text-foreground">{m.label}</AppText>
            {selected ? (
              <AppText variant="small" tone="brand" className="font-semibold">
                ✓
              </AppText>
            ) : m.recommended ? (
              <AppText variant="small" tone="muted">
                Recommended
              </AppText>
            ) : null}
          </Pressable>
        );
      })}
      {!state.transacting && state.marketName ? (
        <AppText variant="small" tone="muted">
          Sales are paused in {state.marketName} right now.
        </AppText>
      ) : null}
    </View>
  );
}
