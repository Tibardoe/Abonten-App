import { AddWalletSheet } from "@/features/wallet/AddWalletSheet";
import {
  PAYMENT_METHODS_KEY,
  usePaymentMethods,
} from "@/features/wallet/usePaymentMethods";
import { api } from "@/lib/api";
import type { PaymentMethodRow } from "@abonten/api-client";
import { AppText, Icon, useToast } from "@abonten/ui-native";
import { useTranslations } from "@abonten/ui-native/i18n";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";

// How the buyer pays one order: a saved wallet entry, or a way to pay on
// the provider's page ("Card", "Bank transfer", "USSD"…). The order's
// market decides both lists — the server answers GET /payments/options
// from the listing's country and currency, so a Lagos event offers what
// Paystack Nigeria can take and a London one what Stripe can, without the
// app knowing either. Saved entries that can't pay there (a Ghanaian wallet
// for a Kenyan event) stay visible but can't be picked, with the reason.
// A wallet can be added from the list itself; it is then picked for this
// order, once the server says it can pay here.

export type PaymentTarget =
  | { kind: "ticket"; checkoutSessionIds: string[] }
  | { kind: "event" | "place" | "spotlight"; checkoutId: string };

export type PaymentChoice =
  | { paymentMethodId: string; method: null }
  | { paymentMethodId: null; method: string }
  | null;

function savedLabel(m: PaymentMethodRow, t: (key: string) => string): string {
  const d = m.details as Record<string, string>;
  return m.method_type === "momo"
    ? `${d.networkName ?? t("mobileMoney")} · ${d.phone ?? ""}`
    : `${d.brand ?? t("card")} ···· ${d.last4 ?? ""}`;
}

export function usePaymentChoice(target: PaymentTarget | null) {
  const t = useTranslations("checkout");

  const queryClient = useQueryClient();
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

  // A wallet just added is unknown to the options answer until it is asked
  // again, so refresh both lists before picking it. Returns why it can't
  // pay for this order, or null once it is chosen.
  async function adoptSaved(id: string): Promise<string | null> {
    const [, refreshed] = await Promise.all([
      queryClient.invalidateQueries({ queryKey: PAYMENT_METHODS_KEY }),
      options.refetch(),
    ]);
    const answer = refreshed.data?.status === 200 ? refreshed.data.data : null;
    const entry = answer?.saved.find((s) => s.id === id);
    if (answer && !entry?.usable) {
      return entry?.reason ?? t("itCanTPayForThis");
    }
    setSavedId(id);
    setMethod(null);
    return null;
  }

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
    adoptSaved,
  };
}

export function PaymentChoiceList({
  state,
}: {
  state: ReturnType<typeof usePaymentChoice>;
}) {
  const t = useTranslations("checkout");

  const { saved, hosted, choice, isUsable, reasonFor } = state;
  const toast = useToast();
  const [adding, setAdding] = useState(false);

  async function onAdded(method: PaymentMethodRow) {
    const problem = await state.adoptSaved(method.id);
    if (problem) {
      toast.info(t("walletSaved"), { description: problem });
      return;
    }
    toast.success(t("walletAdded"), {
      description: t("itSSelectedForThisPayment"),
    });
  }

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
                {savedLabel(m, t)}
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
      <Pressable
        accessibilityRole="button"
        accessibilityHint={t("savesAMobileMoneyWalletOr")}
        onPress={() => setAdding(true)}
        className="flex-row items-center gap-3 rounded-xl border border-dashed border-border bg-card p-3 active:opacity-80"
      >
        <Icon name="add-circle-outline" size={20} tone="primary" />
        <View className="flex-1">
          <AppText className="text-sm font-semibold text-foreground">
            {saved.length > 0 ? t("addAnotherWallet") : t("addAWallet")}
          </AppText>
          <AppText variant="small" tone="muted">
            {t("mobileMoneyOrCardSavedFor")}
          </AppText>
        </View>
      </Pressable>
      {hosted.length > 0 ? (
        <AppText variant="small" tone="muted" className="mt-1">
          {t("orPayOnceWithoutSaving")}
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
                {t("recommended")}
              </AppText>
            ) : null}
          </Pressable>
        );
      })}
      {!state.transacting && state.marketName ? (
        <AppText variant="small" tone="muted">
          {t("salesArePausedInRightNow", { marketName: state.marketName })}
        </AppText>
      ) : null}
      <AddWalletSheet
        open={adding}
        onClose={() => setAdding(false)}
        onAdded={onAdded}
        showConfirmation={false}
      />
    </View>
  );
}
