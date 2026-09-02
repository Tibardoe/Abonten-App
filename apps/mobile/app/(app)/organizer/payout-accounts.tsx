import {
  useAddPayoutAccount,
  usePayoutAccounts,
  useRemovePayoutAccount,
  useSetDefaultPayoutAccount,
} from "@/features/organizer/usePayouts";
import { useMomoNetworks } from "@/features/wallet/usePaymentMethods";
import type {
  AddPayoutAccountBody,
  PayoutAccountRow,
} from "@abonten/api-client";
import { useThemeColors } from "@abonten/ui-native/theme";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";

const GH_PHONE = /^(0[0-9]{9}|\+233[0-9]{9})$/;

function accountTitle(a: PayoutAccountRow): string {
  const kind = a.account_type === "mobile_money" ? "Mobile money" : "Bank";
  return `${a.provider ?? kind} · ${a.account_number}`;
}

export default function PayoutAccountsScreen() {
  const c = useThemeColors();
  const { data, isLoading, isError, refetch } = usePayoutAccounts();
  const networks = useMomoNetworks();
  const add = useAddPayoutAccount();
  const remove = useRemovePayoutAccount();
  const setDefault = useSetDefaultPayoutAccount();

  const [mode, setMode] = useState<"none" | "mobile_money" | "bank">("none");
  const [holder, setHolder] = useState("");
  const [networkCode, setNetworkCode] = useState<string | null>(null);
  const [phone, setPhone] = useState("");
  const [bankName, setBankName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");

  const accounts = data?.status === 200 ? (data.data ?? []) : [];
  const networkList =
    networks.data?.status === 200 ? (networks.data.data ?? []) : [];

  function resetForm() {
    setMode("none");
    setHolder("");
    setNetworkCode(null);
    setPhone("");
    setBankName("");
    setAccountNumber("");
  }

  async function onAdd() {
    if (holder.trim().length < 2) {
      Alert.alert("Enter the account holder's name");
      return;
    }

    let body: AddPayoutAccountBody;
    if (mode === "mobile_money") {
      const net = networkList.find((n) => n.code === networkCode);
      if (!net) {
        Alert.alert("Pick a mobile money network");
        return;
      }
      if (!GH_PHONE.test(phone.trim())) {
        Alert.alert("Enter a valid Ghana phone number (024XXXXXXX or +233…)");
        return;
      }
      body = {
        accountType: "mobile_money",
        accountHolderName: holder.trim(),
        networkCode: net.code,
        networkName: net.name,
        phone: phone.trim(),
      };
    } else if (mode === "bank") {
      if (bankName.trim().length < 2) {
        Alert.alert("Enter the bank name");
        return;
      }
      if (!/^[0-9]{8,20}$/.test(accountNumber.trim())) {
        Alert.alert("Enter a valid account number (8–20 digits)");
        return;
      }
      body = {
        accountType: "bank",
        accountHolderName: holder.trim(),
        bankName: bankName.trim(),
        accountNumber: accountNumber.trim(),
      };
    } else {
      return;
    }

    const res = await add.mutateAsync(body);
    if (res.status === 200) {
      resetForm();
      return;
    }
    Alert.alert("Couldn't add account", res.message ?? "Please try again.");
  }

  function confirmRemove(id: string) {
    Alert.alert("Remove this payout account?", undefined, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          const res = await remove.mutateAsync(id);
          if (res.status !== 200) {
            Alert.alert("Couldn't remove", res.message ?? "Please try again.");
          }
        },
      },
    ]);
  }

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator />
      </View>
    );
  }

  if (isError) {
    return (
      <View className="flex-1 items-center justify-center gap-3 bg-background px-6">
        <Text className="text-center text-muted-foreground">
          Couldn't load your payout accounts.
        </Text>
        <Pressable
          className="rounded-lg bg-primary px-4 py-2 active:opacity-90"
          onPress={() => refetch()}
        >
          <Text className="font-semibold text-primary-foreground">Retry</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="gap-4 p-4 pb-10"
    >
      {accounts.length === 0 ? (
        <Text className="text-sm text-muted-foreground">
          No payout accounts yet. Add one to withdraw your earnings.
        </Text>
      ) : (
        accounts.map((a) => (
          <View
            key={a.id}
            className="gap-2 rounded-xl border border-border bg-card p-4"
          >
            <View className="flex-row items-center justify-between">
              <Text className="flex-1 text-sm font-medium text-foreground">
                {accountTitle(a)}
              </Text>
              {a.is_default ? (
                <View className="rounded-full bg-accent px-2 py-0.5">
                  <Text className="text-[10px] font-semibold uppercase text-accent-foreground">
                    Default
                  </Text>
                </View>
              ) : null}
            </View>
            <Text className="text-xs text-muted-foreground">
              {a.account_holder_name}
            </Text>
            <View className="flex-row gap-4">
              {!a.is_default ? (
                <Pressable
                  onPress={() => setDefault.mutate(a.id)}
                  disabled={setDefault.isPending}
                >
                  <Text className="text-xs font-semibold text-primary">
                    Make default
                  </Text>
                </Pressable>
              ) : null}
              <Pressable
                onPress={() => confirmRemove(a.id)}
                disabled={remove.isPending}
              >
                <Text className="text-xs font-semibold text-destructive">
                  Remove
                </Text>
              </Pressable>
            </View>
          </View>
        ))
      )}

      {mode === "none" ? (
        <View className="flex-row gap-2">
          <Pressable
            onPress={() => setMode("mobile_money")}
            className="flex-1 items-center rounded-xl border border-dashed border-border py-3"
          >
            <Text className="text-sm font-semibold text-foreground">
              + Mobile money
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setMode("bank")}
            className="flex-1 items-center rounded-xl border border-dashed border-border py-3"
          >
            <Text className="text-sm font-semibold text-foreground">
              + Bank
            </Text>
          </Pressable>
        </View>
      ) : (
        <View className="gap-3 rounded-xl border border-border bg-card p-4">
          <Text className="text-sm font-semibold text-foreground">
            {mode === "mobile_money" ? "Add mobile money" : "Add bank account"}
          </Text>

          <TextInput
            value={holder}
            onChangeText={setHolder}
            placeholder="Account holder name"
            className="rounded-lg border border-border bg-background px-3 py-2 text-foreground"
            placeholderTextColor={c["muted-foreground"]}
          />

          {mode === "mobile_money" ? (
            <>
              <View className="flex-row flex-wrap gap-2">
                {networkList.map((nw) => {
                  const selected = nw.code === networkCode;
                  return (
                    <Pressable
                      key={nw.code}
                      onPress={() => setNetworkCode(nw.code)}
                      className={`rounded-full border px-3 py-1.5 ${
                        selected
                          ? "border-primary bg-primary"
                          : "border-border bg-background"
                      }`}
                    >
                      <Text
                        className={`text-xs ${
                          selected
                            ? "text-primary-foreground"
                            : "text-foreground"
                        }`}
                      >
                        {nw.name}
                      </Text>
                    </Pressable>
                  );
                })}
                {networks.isLoading ? <ActivityIndicator /> : null}
              </View>
              <TextInput
                value={phone}
                onChangeText={setPhone}
                placeholder="024XXXXXXX"
                keyboardType="phone-pad"
                autoCapitalize="none"
                className="rounded-lg border border-border bg-background px-3 py-2 text-foreground"
                placeholderTextColor={c["muted-foreground"]}
              />
            </>
          ) : (
            <>
              <TextInput
                value={bankName}
                onChangeText={setBankName}
                placeholder="Bank name"
                className="rounded-lg border border-border bg-background px-3 py-2 text-foreground"
                placeholderTextColor={c["muted-foreground"]}
              />
              <TextInput
                value={accountNumber}
                onChangeText={setAccountNumber}
                placeholder="Account number"
                keyboardType="number-pad"
                className="rounded-lg border border-border bg-background px-3 py-2 text-foreground"
                placeholderTextColor={c["muted-foreground"]}
              />
            </>
          )}

          <View className="flex-row gap-2">
            <Pressable
              onPress={onAdd}
              disabled={add.isPending}
              className="flex-1 items-center rounded-lg bg-primary px-4 py-2.5"
            >
              {add.isPending ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text className="text-sm font-semibold text-primary-foreground">
                  Save
                </Text>
              )}
            </Pressable>
            <Pressable
              onPress={resetForm}
              className="items-center rounded-lg border border-border px-4 py-2.5"
            >
              <Text className="text-sm text-foreground">Cancel</Text>
            </Pressable>
          </View>
        </View>
      )}
    </ScrollView>
  );
}
