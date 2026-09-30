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
import { useState } from "react";
import { Alert, Pressable, ScrollView, View } from "react-native";

// One coherent "manage your wallet" experience: a single + Add Wallet action
// opens <AddWalletSheet> (choose type -> fill form -> success), the same
// sheet the checkout's payment picker opens.

function methodTitle(m: PaymentMethodRow): string {
  const d = m.details as Record<string, string>;
  if (m.method_type === "momo") {
    return `${d.networkName ?? "Mobile money"} · ${d.phone ?? ""}`;
  }
  return `${d.brand ?? "Card"} ···· ${d.last4 ?? ""}`;
}

export default function WalletScreen() {
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
    Alert.alert("Remove this payment method?", undefined, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          const res = await removeMethod.mutateAsync(id);
          if (res.status === 200) {
            toast.success("Payment method removed");
            return;
          }
          toast.error(res.message ?? "We couldn't remove that card.", {
            description: "It is still on your account. Please try again.",
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
          title="Wallets"
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
        title="Wallets"
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
              No wallets yet. Add a mobile money wallet or a card to check out
              faster.
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
                  {methodTitle(m)}
                </AppText>
                {m.is_default ? (
                  <View className="rounded-full bg-accent px-2 py-1">
                    <AppText className="text-[12px] font-semibold uppercase text-accent-foreground">
                      Default
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
                            toast.error("Couldn't set default", {
                              description: res.message ?? "Please try again.",
                            });
                          }
                        },
                        onError: () =>
                          toast.error("Couldn't set default", {
                            description: "Please try again.",
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
                      Make default
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
                    Remove
                  </AppText>
                </Pressable>
              </View>
            </View>
          ))
        )}

        <Button
          title="Add Wallet"
          leftIcon="add"
          onPress={() => setAdding(true)}
        />
      </ScrollView>

      <AddWalletSheet open={adding} onClose={() => setAdding(false)} />
    </View>
  );
}
