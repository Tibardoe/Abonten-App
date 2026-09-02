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
  View,
} from "react-native";

const GH_PHONE = /^(0[0-9]{9}|\+233[0-9]{9})$/;

// Same "choose type -> form -> success" bottom-sheet shell as the Wallet
// screen (and the web AddPayoutAccountPopup), applied to organizer payout
// destinations. Reuses the existing useAddPayoutAccount API + validation.
type SheetStep = "closed" | "choose" | "mobile_money" | "bank";

function accountTitle(a: PayoutAccountRow): string {
  const kind = a.account_type === "mobile_money" ? "Mobile money" : "Bank";
  return `${a.provider ?? kind} · ${a.account_number}`;
}

export default function PayoutAccountsScreen() {
  const { data, isLoading, isError, refetch } = usePayoutAccounts();
  const networks = useMomoNetworks();
  const add = useAddPayoutAccount();
  const remove = useRemovePayoutAccount();
  const setDefault = useSetDefaultPayoutAccount();

  const [step, setStep] = useState<SheetStep>("closed");
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [holder, setHolder] = useState("");
  const [networkCode, setNetworkCode] = useState<string | null>(null);
  const [phone, setPhone] = useState("");
  const [bankName, setBankName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");

  const accounts = data?.status === 200 ? (data.data ?? []) : [];
  const networkList =
    networks.data?.status === 200 ? (networks.data.data ?? []) : [];

  function closeSheet() {
    setStep("closed");
    setFormError(null);
    setSuccess(null);
    setHolder("");
    setNetworkCode(null);
    setPhone("");
    setBankName("");
    setAccountNumber("");
  }

  async function onAdd() {
    setFormError(null);
    if (holder.trim().length < 2) {
      setFormError("Enter the account holder's name.");
      return;
    }

    let body: AddPayoutAccountBody;
    if (step === "mobile_money") {
      const net = networkList.find((n) => n.code === networkCode);
      if (!net) {
        setFormError("Pick a mobile money network.");
        return;
      }
      if (!GH_PHONE.test(phone.trim())) {
        setFormError("Enter a valid Ghana phone number (024XXXXXXX or +233…).");
        return;
      }
      body = {
        accountType: "mobile_money",
        accountHolderName: holder.trim(),
        networkCode: net.code,
        networkName: net.name,
        phone: phone.trim(),
      };
    } else if (step === "bank") {
      if (bankName.trim().length < 2) {
        setFormError("Enter the bank name.");
        return;
      }
      if (!/^[0-9]{8,20}$/.test(accountNumber.trim())) {
        setFormError("Enter a valid account number (8–20 digits).");
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
      setSuccess(
        step === "mobile_money"
          ? "Mobile money payout account added."
          : "Bank payout account added.",
      );
      return;
    }
    setFormError(
      res.message ?? "We couldn't add that account. Please try again.",
    );
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

  const sheetTitle = success
    ? "All set"
    : step === "choose"
      ? "Add a payout account"
      : step === "mobile_money"
        ? "Mobile money account"
        : step === "bank"
          ? "Bank account"
          : "";

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
        <AppText className="text-center text-muted-foreground">
          Couldn't load your payout accounts.
        </AppText>
        <Button title="Retry" onPress={() => refetch()} />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background">
      <ScrollView
        className="flex-1 bg-background"
        contentContainerClassName="gap-4 p-4 pb-10"
      >
        {accounts.length === 0 ? (
          <View className="items-center gap-2 rounded-xl border border-dashed border-border bg-card px-6 py-10">
            <Icon name="cash-outline" size={28} tone="muted" />
            <AppText className="text-center text-sm text-muted-foreground">
              No payout accounts yet. Add one to withdraw your earnings.
            </AppText>
          </View>
        ) : (
          accounts.map((a) => (
            <View
              key={a.id}
              className="gap-2 rounded-xl border border-border bg-card p-4"
            >
              <View className="flex-row items-center justify-between">
                <AppText className="flex-1 text-sm font-medium text-foreground">
                  {accountTitle(a)}
                </AppText>
                {a.is_default ? (
                  <View className="rounded-full bg-accent px-2 py-0.5">
                    <AppText className="text-[10px] font-semibold uppercase text-accent-foreground">
                      Default
                    </AppText>
                  </View>
                ) : null}
              </View>
              <AppText variant="muted">{a.account_holder_name}</AppText>
              <View className="flex-row gap-4">
                {!a.is_default ? (
                  <Pressable
                    onPress={() => setDefault.mutate(a.id)}
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
                  onPress={() => confirmRemove(a.id)}
                  disabled={remove.isPending}
                >
                  <AppText className="text-[13px] font-semibold text-destructive">
                    Remove
                  </AppText>
                </Pressable>
              </View>
            </View>
          ))
        )}

        <Button
          title="Add Payout Account"
          leftIcon="add"
          onPress={() => setStep("choose")}
        />
      </ScrollView>

      <Sheet
        open={step !== "closed"}
        onClose={closeSheet}
        onBack={
          !success && (step === "mobile_money" || step === "bank")
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
              onPress={() => setStep("mobile_money")}
            />
            <SheetOption
              icon="business-outline"
              title="Bank Account"
              subtitle="Receive earnings directly into your bank"
              onPress={() => setStep("bank")}
            />
          </View>
        ) : (
          <View className="gap-3">
            <AppText variant="label">Account holder name</AppText>
            <Input
              value={holder}
              onChangeText={setHolder}
              placeholder="e.g. Ama Mensah"
              autoCapitalize="words"
            />

            {step === "mobile_money" ? (
              <>
                <AppText variant="label">Network</AppText>
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
                        <AppText
                          className={`text-[13px] ${
                            selected
                              ? "text-primary-foreground"
                              : "text-foreground"
                          }`}
                        >
                          {nw.name}
                        </AppText>
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
                />
              </>
            ) : (
              <>
                <AppText variant="label">Bank</AppText>
                <Input
                  value={bankName}
                  onChangeText={setBankName}
                  placeholder="Bank name"
                  autoCapitalize="words"
                />
                <AppText variant="label">Account number</AppText>
                <Input
                  value={accountNumber}
                  onChangeText={setAccountNumber}
                  placeholder="Account number"
                  keyboardType="number-pad"
                />
              </>
            )}

            {formError ? (
              <AppText variant="small" tone="error">
                {formError}
              </AppText>
            ) : null}

            <Button
              title="Save account"
              fullWidth
              loading={add.isPending}
              onPress={onAdd}
            />
          </View>
        )}
      </Sheet>
    </View>
  );
}
