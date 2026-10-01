import { AppHeader } from "@/components/app/AppHeader";
import { QueryUnavailable } from "@/components/app/QueryUnavailable";
import { WalletSkeleton } from "@/components/skeletons";
import { AddWalletSheet } from "@/features/wallet/AddWalletSheet";
import {
  usePaymentMethods,
  useRemovePaymentMethod,
  useSetDefaultPaymentMethod,
} from "@/features/wallet/usePaymentMethods";
import { useQueryView } from "@/lib/useQueryView";
import type { PaymentMethodRow } from "@abonten/api-client";
import { AppText, Button, Icon, Refresher, useToast } from "@abonten/ui-native";
import { useTranslations } from "@abonten/ui-native/i18n";
import { useState } from "react";
import { Alert, Pressable, ScrollView, View } from "react-native";

// One coherent "manage your wallet" experience: a single + Add Wallet action
// opens <AddWalletSheet> (choose type -> fill form -> success), the same
// sheet the checkout's payment picker opens.

function methodTitle(m: PaymentMethodRow, t: (key: string) => string): string {
  const d = m.details as Record<string, string>;
  if (m.method_type === "momo") {
    return `${d.networkName ?? t("mobileMoney")} · ${d.phone ?? ""}`;
  }
  return `${d.brand ?? t("card")} ···· ${d.last4 ?? ""}`;
}

export default function WalletScreen() {
  const t = useTranslations("wallet");

  const toast = useToast();
  const methodsQuery = usePaymentMethods();
  const { data, isRefetching, refetch } = methodsQuery;
  // Loading, offline and failed are told apart from "no wallets yet": that
  // is only ever said for an answer the server gave. Payment methods are
  // never cached on disk, so offline with nothing loaded this session says
  // so instead of inviting the person to add a wallet they already have.
  const view = useQueryView(methodsQuery);
  const removeMethod = useRemovePaymentMethod();
  const setDefault = useSetDefaultPaymentMethod();

  const [adding, setAdding] = useState(false);

  const methods = data?.status === 200 ? (data.data ?? []) : [];

  function confirmRemove(id: string) {
    Alert.alert(t("removeThisPaymentMethod"), undefined, [
      { text: t("cancel"), style: "cancel" },
      {
        text: t("remove"),
        style: "destructive",
        onPress: async () => {
          const res = await removeMethod.mutateAsync(id);
          if (res.status === 200) {
            toast.success(t("paymentMethodRemoved2"));
            return;
          }
          toast.error(res.message ?? t("weCouldnTRemoveThatCard"), {
            description: t("itIsStillOnYourAccount"),
          });
        },
      },
    ]);
  }

  if (view.kind !== "content" && view.kind !== "empty") {
    return (
      <View className="flex-1 bg-background">
        <AppHeader
          variant="title"
          title={t("wallets")}
          backFallback="/(app)/account"
        />
        <QueryUnavailable
          view={view}
          subject="your payment methods"
          onRetry={() => refetch()}
          loading={<WalletSkeleton />}
        />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background">
      <AppHeader
        variant="title"
        title={t("wallets")}
        backFallback="/(app)/account"
      />
      <ScrollView
        className="flex-1 bg-background"
        contentContainerClassName="gap-4 p-4 pb-10"
        refreshControl={<Refresher onRefresh={() => refetch()} />}
      >
        {methods.length === 0 ? (
          <View className="items-center gap-2 rounded-xl border border-dashed border-border bg-card px-6 py-10">
            <Icon name="wallet-outline" size={28} tone="muted" />
            <AppText variant="muted" className="text-center">
              {t("noWalletsYetAddAMobile")}
            </AppText>
          </View>
        ) : (
          methods.map((m) => (
            <View
              key={m.id}
              className="gap-2 rounded-xl border border-border bg-card p-4"
            >
              <View className="flex-row items-center justify-between">
                <AppText
                  variant="small"
                  className="flex-1 font-medium"
                  numberOfLines={1}
                >
                  {methodTitle(m, t)}
                </AppText>
                {m.is_default ? (
                  <View className="rounded-full bg-accent px-2 py-1">
                    <AppText className="text-[12px] font-semibold uppercase text-accent-foreground">
                      {t("defaultText")}
                    </AppText>
                  </View>
                ) : null}
              </View>
              <View className="flex-row gap-4">
                {!m.is_default ? (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() =>
                      setDefault.mutate(m.id, {
                        onSettled: (res) => {
                          if (res && res.status !== 200) {
                            toast.error(t("couldnTSetDefault"), {
                              description: res.message ?? t("pleaseTryAgain"),
                            });
                          }
                        },
                        onError: () =>
                          toast.error(t("couldnTSetDefault"), {
                            description: t("pleaseTryAgain"),
                          }),
                      })
                    }
                    disabled={setDefault.isPending}
                  >
                    <AppText
                      variant="small"
                      tone="brand"
                      className="font-semibold"
                    >
                      {t("makeDefault")}
                    </AppText>
                  </Pressable>
                ) : null}
                <Pressable
                  accessibilityRole="button"
                  onPress={() => confirmRemove(m.id)}
                  disabled={removeMethod.isPending}
                >
                  <AppText
                    variant="small"
                    tone="error"
                    className="font-semibold"
                  >
                    {t("remove")}
                  </AppText>
                </Pressable>
              </View>
            </View>
          ))
        )}

        <Button
          title={t("addWallet2")}
          leftIcon="add"
          onPress={() => setAdding(true)}
        />
      </ScrollView>

      <AddWalletSheet open={adding} onClose={() => setAdding(false)} />
    </View>
  );
}
