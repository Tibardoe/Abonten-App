import { AppHeader } from "@/components/app/AppHeader";
import {
  useAddCard,
  useAddMomoWallet,
  useMomoNetworks,
  usePaymentMethods,
  useRemovePaymentMethod,
  useSetDefaultPaymentMethod,
} from "@/features/wallet/usePaymentMethods";
import type { PaymentMethodRow } from "@abonten/api-client";
import {
  AppText,
  Button,
  Icon,
  Input,
  Sheet,
  SheetOption,
} from "@abonten/ui-native";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";

const GH_PHONE = /^(0[0-9]{9}|\+233[0-9]{9})$/;

// One coherent "manage your wallet" experience: a single + Add Wallet action
// opens a bottom sheet that steps choose type -> fill form -> success, the
// native echo of the web AddPaymentMethodPopup two-step shell. The payment /
// tokenisation logic (useAddMomoWallet / useAddCard) is untouched.
type SheetStep = "closed" | "choose" | "momo" | "card";

function methodTitle(m: PaymentMethodRow): string {
  const d = m.details as Record<string, string>;
  if (m.method_type === "momo") {
    return `${d.networkName ?? "Mobile money"} · ${d.phone ?? ""}`;
  }
  return `${d.brand ?? "Card"} ···· ${d.last4 ?? ""}`;
}

export default function WalletScreen() {
  const { data, isLoading, isError, refetch } = usePaymentMethods();
  const networks = useMomoNetworks();
  const addMomo = useAddMomoWallet();
  const addCard = useAddCard();
  const removeMethod = useRemovePaymentMethod();
  const setDefault = useSetDefaultPaymentMethod();

  const [step, setStep] = useState<SheetStep>("closed");
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [networkCode, setNetworkCode] = useState<string | null>(null);
  const [phone, setPhone] = useState("");

  const methods = data?.status === 200 ? (data.data ?? []) : [];
  const networkList =
    networks.data?.status === 200 ? (networks.data.data ?? []) : [];

  function closeSheet() {
    setStep("closed");
    setFormError(null);
    setSuccess(null);
    setNetworkCode(null);
    setPhone("");
  }

  async function submitMomo() {
    setFormError(null);
    const net = networkList.find((n) => n.code === networkCode);
    if (!net) {
      setFormError("Choose your mobile money network.");
      return;
    }
    if (!GH_PHONE.test(phone.trim())) {
      setFormError("Enter a valid Ghana phone number (024XXXXXXX or +233…).");
      return;
    }
    const res = await addMomo.mutateAsync({
      networkCode: net.code,
      networkName: net.name,
      phone: phone.trim(),
    });
    if (res.status === 200) {
      setSuccess("Mobile money wallet added.");
      return;
    }
    // Covers duplicate-wallet and any server-side validation failure.
    setFormError(
      res.message ?? "We couldn't add that wallet. Please try again.",
    );
  }

  async function startCardVerification() {
    setFormError(null);
    const res = await addCard.mutateAsync(undefined);
    if (res.status === 200) {
      setSuccess("Card added.");
      return;
    }
    setFormError(
      res.message ??
        "We couldn't verify that card. You won't have been charged.",
    );
  }

  function confirmRemove(id: string) {
    Alert.alert("Remove this payment method?", undefined, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          const res = await removeMethod.mutateAsync(id);
          if (res.status !== 200) {
            Alert.alert("Couldn't remove", res.message ?? "Please try again.");
          }
        },
      },
    ]);
  }

  const sheetTitle = success
    ? "All set"
    : step === "choose"
      ? "Add a wallet"
      : step === "momo"
        ? "Add mobile money"
        : step === "card"
          ? "Add debit / credit card"
          : "";

  if (isLoading) {
    return (
      <View className="flex-1 bg-background">
        <AppHeader variant="branded" />
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator />
        </View>
      </View>
    );
  }

  if (isError) {
    return (
      <View className="flex-1 bg-background">
        <AppHeader variant="branded" />
        <View className="flex-1 items-center justify-center gap-3 px-6">
          <Text className="text-center text-muted-foreground">
            Couldn't load your payment methods.
          </Text>
          <Button title="Retry" onPress={() => refetch()} />
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background">
      <AppHeader variant="branded" />
      <ScrollView
        className="flex-1 bg-background"
        contentContainerClassName="gap-4 p-4 pb-10"
      >
        {methods.length === 0 ? (
          <View className="items-center gap-2 rounded-xl border border-dashed border-border bg-card px-6 py-10">
            <Icon name="wallet-outline" size={28} tone="muted" />
            <Text className="text-center text-sm text-muted-foreground">
              No wallets yet. Add a mobile money wallet or a card to check out
              faster.
            </Text>
          </View>
        ) : (
          methods.map((m) => (
            <View
              key={m.id}
              className="gap-2 rounded-xl border border-border bg-card p-4"
            >
              <View className="flex-row items-center justify-between">
                <Text className="flex-1 text-sm font-medium text-foreground">
                  {methodTitle(m)}
                </Text>
                {m.is_default ? (
                  <View className="rounded-full bg-accent px-2 py-0.5">
                    <Text className="text-[10px] font-semibold uppercase text-accent-foreground">
                      Default
                    </Text>
                  </View>
                ) : null}
              </View>
              <View className="flex-row gap-4">
                {!m.is_default ? (
                  <Pressable
                    onPress={() => setDefault.mutate(m.id)}
                    disabled={setDefault.isPending}
                  >
                    <Text className="text-xs font-semibold text-primary">
                      Make default
                    </Text>
                  </Pressable>
                ) : null}
                <Pressable
                  onPress={() => confirmRemove(m.id)}
                  disabled={removeMethod.isPending}
                >
                  <Text className="text-xs font-semibold text-destructive">
                    Remove
                  </Text>
                </Pressable>
              </View>
            </View>
          ))
        )}

        <Button
          title="Add Wallet"
          leftIcon="add"
          onPress={() => setStep("choose")}
        />
      </ScrollView>

      <Sheet
        open={step !== "closed"}
        onClose={closeSheet}
        onBack={
          !success && (step === "momo" || step === "card")
            ? () => {
                setFormError(null);
                setStep("choose");
              }
            : undefined
        }
        title={sheetTitle}
      >
        {success ? (
          <View className="items-center gap-4 py-6">
            <View className="h-14 w-14 items-center justify-center rounded-full bg-accent">
              <Icon name="checkmark" size={30} tone="primary" />
            </View>
            <AppText className="text-center text-[15px] text-foreground">
              {success}
            </AppText>
            <Button title="Done" fullWidth onPress={closeSheet} />
          </View>
        ) : step === "choose" ? (
          <View className="gap-3">
            <SheetOption
              icon="phone-portrait-outline"
              title="Mobile Money"
              subtitle="MTN, Telecel, AT Money, G-Money"
              onPress={() => setStep("momo")}
            />
            <SheetOption
              icon="card-outline"
              title="Card"
              subtitle="Debit or credit — Visa, Mastercard"
              onPress={() => setStep("card")}
            />
          </View>
        ) : step === "momo" ? (
          <View className="gap-3">
            <AppText variant="label">Network</AppText>
            <View className="flex-row flex-wrap gap-2">
              {networkList.map((n) => {
                const selected = n.code === networkCode;
                return (
                  <Pressable
                    key={n.code}
                    onPress={() => setNetworkCode(n.code)}
                    className={`rounded-full border px-3 py-1.5 ${
                      selected
                        ? "border-primary bg-primary"
                        : "border-border bg-background"
                    }`}
                  >
                    <Text
                      className={`text-xs ${
                        selected ? "text-primary-foreground" : "text-foreground"
                      }`}
                    >
                      {n.name}
                    </Text>
                  </Pressable>
                );
              })}
              {networks.isLoading ? <ActivityIndicator /> : null}
            </View>

            <Input
              value={phone}
              onChangeText={setPhone}
              placeholder="024XXXXXXX"
              keyboardType="phone-pad"
              autoCapitalize="none"
              invalid={!!formError}
            />

            {formError ? (
              <AppText className="text-[12px] text-destructive">
                {formError}
              </AppText>
            ) : null}

            <Button
              title="Save wallet"
              fullWidth
              loading={addMomo.isPending}
              onPress={submitMomo}
            />
          </View>
        ) : (
          <View className="gap-3">
            <AppText className="text-[13px] text-muted-foreground">
              Adding a card runs a GHS 1 verification charge that is refunded
              immediately. Your card number is never stored — only a reusable
              token from Paystack.
            </AppText>

            {formError ? (
              <AppText className="text-[12px] text-destructive">
                {formError}
              </AppText>
            ) : null}

            <Button
              title="Start card verification"
              fullWidth
              loading={addCard.isPending}
              onPress={startCardVerification}
            />
            <Button
              title="Cancel"
              variant="outline"
              fullWidth
              onPress={closeSheet}
            />
          </View>
        )}
      </Sheet>
    </View>
  );
}
