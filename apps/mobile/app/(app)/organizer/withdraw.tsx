import { useOrganizerFinance } from "@/features/organizer/useOrganizer";
import {
  usePayoutAccounts,
  useRequestPayout,
} from "@/features/organizer/usePayouts";
import { useThemeColors } from "@abonten/ui-native/theme";
import { Link, useRouter } from "expo-router";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";

export default function WithdrawScreen() {
  const router = useRouter();
  const c = useThemeColors();
  const finance = useOrganizerFinance();
  const accountsQ = usePayoutAccounts();
  const request = useRequestPayout();

  const balances =
    finance.data && finance.data.status === 200 ? finance.data.data : [];
  const accounts =
    accountsQ.data && accountsQ.data.status === 200 ? accountsQ.data.data : [];

  const [currency, setCurrency] = useState<string | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [amount, setAmount] = useState("");

  const selectedCurrency = currency ?? balances[0]?.currency ?? null;
  const available = useMemo(
    () =>
      balances.find((b) => b.currency === selectedCurrency)
        ?.available_balance ?? 0,
    [balances, selectedCurrency],
  );
  const defaultAccountId =
    accountId ??
    accounts.find((a) => a.is_default)?.id ??
    accounts[0]?.id ??
    null;

  const loading = finance.isLoading || accountsQ.isLoading;

  async function onSubmit() {
    const value = Number(amount);
    if (!selectedCurrency) {
      Alert.alert("No balance to withdraw");
      return;
    }
    if (!defaultAccountId) {
      Alert.alert("Add a payout account first");
      return;
    }
    if (!Number.isFinite(value) || value <= 0) {
      Alert.alert("Enter an amount greater than zero");
      return;
    }
    if (value > available) {
      Alert.alert(
        "Amount too high",
        `You can withdraw at most ${selectedCurrency} ${available.toFixed(2)}.`,
      );
      return;
    }

    const res = await request.mutateAsync({
      payoutAccountId: defaultAccountId,
      amount: value,
      currency: selectedCurrency,
    });

    if (res.status === 200) {
      Alert.alert(
        "Withdrawal requested",
        `Reference ${res.data.reference}. It will be processed shortly.`,
        [{ text: "OK", onPress: () => router.back() }],
      );
      return;
    }
    Alert.alert(
      "Couldn't request withdrawal",
      res.message ?? "Please try again.",
    );
  }

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator />
      </View>
    );
  }

  if (accounts.length === 0) {
    return (
      <View className="flex-1 items-center justify-center gap-3 bg-background px-6">
        <Text className="text-center text-muted-foreground">
          Add a payout account before you can withdraw.
        </Text>
        <Link href="/(app)/organizer/payout-accounts" asChild>
          <Pressable className="rounded-lg bg-primary px-4 py-2 active:opacity-90">
            <Text className="font-semibold text-primary-foreground">
              Add payout account
            </Text>
          </Pressable>
        </Link>
      </View>
    );
  }

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="gap-5 p-4 pb-10"
    >
      {balances.length > 1 ? (
        <View className="gap-2">
          <Text className="text-xs font-semibold uppercase text-muted-foreground">
            Currency
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {balances.map((b) => {
              const active = b.currency === selectedCurrency;
              return (
                <Pressable
                  key={b.currency}
                  onPress={() => setCurrency(b.currency)}
                  className={
                    active
                      ? "rounded-full bg-primary px-3 py-1.5"
                      : "rounded-full border border-border px-3 py-1.5"
                  }
                >
                  <Text
                    className={
                      active
                        ? "text-xs font-semibold text-primary-foreground"
                        : "text-xs text-muted-foreground"
                    }
                  >
                    {b.currency}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}

      <View className="rounded-xl border border-border bg-card p-4">
        <Text className="text-xs uppercase text-muted-foreground">
          Available
        </Text>
        <Text className="text-2xl font-bold text-foreground">
          {selectedCurrency ?? "GHS"} {available.toFixed(2)}
        </Text>
      </View>

      <View className="gap-2">
        <Text className="text-xs font-semibold uppercase text-muted-foreground">
          To account
        </Text>
        {accounts.map((a) => {
          const active = a.id === defaultAccountId;
          return (
            <Pressable
              key={a.id}
              onPress={() => setAccountId(a.id)}
              className={`rounded-xl border p-3 ${
                active ? "border-primary bg-primary/5" : "border-border bg-card"
              }`}
            >
              <Text className="text-sm font-medium text-foreground">
                {a.provider ?? a.account_type} · {a.account_number}
              </Text>
              <Text className="text-xs text-muted-foreground">
                {a.account_holder_name}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View className="gap-2">
        <Text className="text-xs font-semibold uppercase text-muted-foreground">
          Amount
        </Text>
        <TextInput
          value={amount}
          onChangeText={setAmount}
          placeholder="0.00"
          keyboardType="decimal-pad"
          className="rounded-lg border border-border bg-background px-3 py-2 text-lg text-foreground"
          placeholderTextColor={c["muted-foreground"]}
        />
      </View>

      <Pressable
        onPress={onSubmit}
        disabled={request.isPending}
        className="items-center rounded-xl bg-primary px-4 py-3 active:opacity-90"
      >
        {request.isPending ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text className="text-sm font-semibold text-primary-foreground">
            Request withdrawal
          </Text>
        )}
      </Pressable>

      <Text className="text-center text-[11px] text-muted-foreground">
        Withdrawals are reviewed before the funds are sent.
      </Text>
    </ScrollView>
  );
}
