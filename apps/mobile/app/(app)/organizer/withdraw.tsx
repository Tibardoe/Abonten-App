import { useOrganizerFinance } from "@/features/organizer/useOrganizer";
import {
  usePayoutAccounts,
  useRequestPayout,
} from "@/features/organizer/usePayouts";
import { AppText, Button, Chip, Icon, Overline } from "@abonten/ui-native";
import { useThemeColors } from "@abonten/ui-native/theme";
import { Link, useRouter } from "expo-router";
import { useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from "react-native";

function fmt(currency: string, v: number): string {
  return `${currency} ${v.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

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
  const [confirming, setConfirming] = useState(false);
  const [done, setDone] = useState<{ reference: string } | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const submittedRef = useRef(false);

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
  const selectedAccount = accounts.find((a) => a.id === defaultAccountId);

  const value = Number(amount);
  const amountValid = Number.isFinite(value) && value > 0;
  const overBalance = amountValid && value > available;
  const error = !amount
    ? null
    : !amountValid
      ? "Enter an amount greater than zero."
      : overBalance
        ? `You can withdraw at most ${fmt(selectedCurrency ?? "GHS", available)}.`
        : null;
  const canProceed =
    !!selectedCurrency && !!defaultAccountId && amountValid && !overBalance;

  const loading = finance.isLoading || accountsQ.isLoading;

  async function submit() {
    if (submittedRef.current || !canProceed || !selectedCurrency) return;
    submittedRef.current = true;
    setServerError(null);
    const res = await request.mutateAsync({
      payoutAccountId: defaultAccountId as string,
      amount: value,
      currency: selectedCurrency,
    });
    if (res.status === 200) {
      setDone({ reference: res.data.reference });
      return;
    }
    // Server-side balance check can still reject (stale local balance).
    submittedRef.current = false;
    setConfirming(false);
    setServerError(
      res.message ?? "Couldn't request withdrawal. Please try again.",
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
        <AppText className="text-center text-muted-foreground">
          Add a payout account before you can withdraw.
        </AppText>
        <Link href="/(app)/organizer/payout-accounts" asChild>
          <Pressable className="rounded-lg bg-primary px-4 py-2 active:opacity-90">
            <AppText className="font-semibold text-primary-foreground">
              Add payout account
            </AppText>
          </Pressable>
        </Link>
      </View>
    );
  }

  if (done) {
    return (
      <View className="flex-1 items-center justify-center gap-4 bg-background p-8">
        <Icon name="checkmark-circle" size={56} tone="success" />
        <AppText variant="sectionHeading" className="text-center">
          Withdrawal requested
        </AppText>
        <AppText variant="muted" className="text-center">
          {fmt(selectedCurrency ?? "GHS", value)} to{" "}
          {selectedAccount?.account_number}. Reference {done.reference} — it's
          reviewed before the funds are sent.
        </AppText>
        <Button title="Done" fullWidth onPress={() => router.back()} />
      </View>
    );
  }

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="gap-5 p-4 pb-10"
      keyboardShouldPersistTaps="handled"
    >
      {balances.length > 1 ? (
        <View className="gap-2">
          <Overline>Currency</Overline>
          <View className="flex-row flex-wrap gap-2">
            {balances.map((b) => (
              <Chip
                key={b.currency}
                label={b.currency}
                selected={b.currency === selectedCurrency}
                onPress={() => {
                  setCurrency(b.currency);
                  setConfirming(false);
                }}
              />
            ))}
          </View>
        </View>
      ) : null}

      <View className="rounded-2xl border border-border bg-card p-4">
        <Overline>Available to withdraw</Overline>
        <AppText variant="pageTitle">
          {fmt(selectedCurrency ?? "GHS", available)}
        </AppText>
      </View>

      <View className="gap-2">
        <Overline>To account</Overline>
        {accounts.map((a) => {
          const active = a.id === defaultAccountId;
          return (
            <Pressable
              key={a.id}
              onPress={() => {
                setAccountId(a.id);
                setConfirming(false);
              }}
              className={`rounded-xl border p-3 ${
                active ? "border-primary bg-primary/5" : "border-border bg-card"
              }`}
            >
              <AppText className="text-sm font-medium text-foreground">
                {a.provider ?? a.account_type} · {a.account_number}
              </AppText>
              <AppText variant="muted">{a.account_holder_name}</AppText>
            </Pressable>
          );
        })}
      </View>

      <View className="gap-2">
        <Overline>Amount</Overline>
        <View className="flex-row items-center gap-2">
          <TextInput
            value={amount}
            onChangeText={(v) => {
              setAmount(v);
              setConfirming(false);
            }}
            placeholder="0.00"
            keyboardType="decimal-pad"
            className={`flex-1 rounded-lg border bg-background px-3 py-2.5 text-lg text-foreground ${
              error ? "border-destructive" : "border-border"
            }`}
            placeholderTextColor={c["muted-foreground"]}
          />
          <Pressable
            onPress={() => {
              setAmount(String(available));
              setConfirming(false);
            }}
            className="rounded-lg border border-border px-3 py-3 active:opacity-70"
          >
            <AppText variant="small" tone="brand" className="font-semibold">
              Max
            </AppText>
          </Pressable>
        </View>
        {error ? (
          <AppText variant="caption" tone="error">
            {error}
          </AppText>
        ) : (
          <View className="flex-row justify-between">
            <AppText variant="caption">You'll receive</AppText>
            <AppText variant="metaStrong">
              {fmt(selectedCurrency ?? "GHS", amountValid ? value : 0)}
            </AppText>
          </View>
        )}
        <AppText variant="caption">No withdrawal fee.</AppText>
      </View>

      {serverError ? (
        <View className="rounded-lg border border-destructive/40 bg-destructive/10 p-3">
          <AppText variant="small" tone="error">
            {serverError}
          </AppText>
        </View>
      ) : null}

      {confirming ? (
        <View className="gap-3 rounded-2xl border border-primary/30 bg-primary/5 p-4">
          <AppText variant="bodyStrong">Confirm withdrawal</AppText>
          <View className="flex-row justify-between">
            <AppText variant="muted">Amount</AppText>
            <AppText variant="bodyStrong">
              {fmt(selectedCurrency ?? "GHS", value)}
            </AppText>
          </View>
          <View className="flex-row justify-between">
            <AppText variant="muted">To</AppText>
            <AppText variant="small">{selectedAccount?.account_number}</AppText>
          </View>
          <View className="mt-1 flex-row gap-3">
            <View className="flex-1">
              <Button
                title="Edit"
                variant="outline"
                onPress={() => setConfirming(false)}
                disabled={request.isPending}
              />
            </View>
            <View className="flex-1">
              <Button
                title="Confirm"
                loading={request.isPending}
                disabled={request.isPending}
                onPress={submit}
              />
            </View>
          </View>
        </View>
      ) : (
        <Button
          title="Review withdrawal"
          fullWidth
          disabled={!canProceed}
          onPress={() => setConfirming(true)}
        />
      )}

      <AppText variant="caption" className="text-center">
        Withdrawals are reviewed before the funds are sent.
      </AppText>
    </ScrollView>
  );
}
