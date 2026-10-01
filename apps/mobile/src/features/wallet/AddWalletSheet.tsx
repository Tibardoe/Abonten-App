import { useMarket } from "@/features/markets/MarketProvider";
import {
  useAddCard,
  useAddMomoWallet,
  useMomoNetworks,
} from "@/features/wallet/usePaymentMethods";
import type { PaymentMethodRow } from "@abonten/api-client";
import { parsePhone, parsePhoneWithDialCode } from "@abonten/core/phone/phone";
import {
  AppText,
  Button,
  Icon,
  Input,
  Sheet,
  SheetOption,
} from "@abonten/ui-native";
import { useTranslations } from "@abonten/ui-native/i18n";
import { useState } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";

// A first check before the request, in the market's own numbering plan
// (libphonenumber via @abonten/core/phone). The server parses the number
// again against the person's market and stores one E.164 form.
function walletPhoneLooksValid(raw: string, dialCode: string | null): boolean {
  const text = raw.trim();
  if (text.startsWith("+")) return parsePhone(text).ok;
  if (dialCode) return parsePhoneWithDialCode(dialCode, text).ok;
  return text.replace(/\D/g, "").length >= 7;
}

// The one "add a wallet" flow: a bottom sheet that steps choose type ->
// fill form -> success, the native echo of the web AddPaymentMethodPopup
// two-step shell. Used by the Wallets screen and by the payment picker at
// checkout, which passes `onAdded` to select the new wallet and
// `showConfirmation={false}` to close straight back to the order.
type Step = "choose" | "momo" | "card";

export function AddWalletSheet({
  open,
  onClose,
  onAdded,
  showConfirmation = true,
}: {
  open: boolean;
  onClose: () => void;
  /** The saved row (for a duplicate, the wallet already on file). */
  onAdded?: (method: PaymentMethodRow) => void | Promise<void>;
  /** Show an "All set" step before closing. */
  showConfirmation?: boolean;
}) {
  const t = useTranslations("wallet");

  const { markets, context } = useMarket();
  const homeDialCode =
    markets.find((m) => m.countryCode === context?.marketCountry)?.dialCode ??
    null;
  const networks = useMomoNetworks();
  const addMomo = useAddMomoWallet();
  const addCard = useAddCard();

  const [step, setStep] = useState<Step>("choose");
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [networkCode, setNetworkCode] = useState<string | null>(null);
  const [phone, setPhone] = useState("");
  // Covers the caller's onAdded (e.g. re-checking the payment options).
  const [finishing, setFinishing] = useState(false);

  const networkList =
    networks.data?.status === 200 ? (networks.data.data ?? []) : [];
  const networksFailed =
    !networks.isLoading &&
    networkList.length === 0 &&
    (networks.isError || networks.data?.status !== 200);

  function close() {
    onClose();
    setStep("choose");
    setFormError(null);
    setSuccess(null);
    setNetworkCode(null);
    setPhone("");
  }

  async function added(method: PaymentMethodRow | undefined, text: string) {
    if (method && onAdded) {
      setFinishing(true);
      try {
        await onAdded(method);
      } finally {
        setFinishing(false);
      }
    }
    if (showConfirmation) setSuccess(text);
    else close();
  }

  async function submitMomo() {
    setFormError(null);
    const net = networkList.find((n) => n.code === networkCode);
    if (!net) {
      setFormError(t("chooseYourMobileMoneyNetwork"));
      return;
    }
    if (!walletPhoneLooksValid(phone, homeDialCode)) {
      setFormError(t("enterAValidMobileMoneyNumber"));
      return;
    }
    const res = await addMomo.mutateAsync({
      networkCode: net.code,
      networkName: net.name,
      phone: phone.trim(),
    });
    if (res.status === 200) {
      await added(res.data, t("mobileMoneyWalletAdded"));
      return;
    }
    // Covers duplicate-wallet and any server-side validation failure.
    setFormError(res.message ?? t("weCouldnTAddThatWallet"));
  }

  async function startCardVerification() {
    setFormError(null);
    const res = await addCard.mutateAsync(undefined);
    if (res.status === 200) {
      await added(res.data, t("cardAdded"));
      return;
    }
    setFormError(res.message ?? t("weCouldnTVerifyThatCard"));
  }

  const title = success
    ? t("allSet")
    : step === "choose"
      ? t("addAWallet")
      : step === "momo"
        ? t("addMobileMoney")
        : t("addDebitCreditCard");

  return (
    <Sheet
      open={open}
      onClose={close}
      minHeightRatio={step === "choose" ? 0.5 : 0.6}
      onBack={
        !success && (step === "momo" || step === "card")
          ? () => {
              setFormError(null);
              setStep("choose");
            }
          : undefined
      }
      title={title}
    >
      {success ? (
        <View className="items-center gap-4 py-6">
          <View className="h-14 w-14 items-center justify-center rounded-full bg-accent">
            <Icon name="checkmark" size={30} tone="primary" />
          </View>
          <AppText variant="body" className="text-center">
            {success}
          </AppText>
          <Button title={t("done")} fullWidth onPress={close} />
        </View>
      ) : step === "choose" ? (
        <View className="gap-3">
          <SheetOption
            icon="phone-portrait-outline"
            title={t("mobileMoney")}
            subtitle={t("mtnTelecelAtMoneyGMoney")}
            onPress={() => setStep("momo")}
          />
          <SheetOption
            icon="card-outline"
            title={t("card")}
            subtitle={t("debitOrCreditVisaMastercard")}
            onPress={() => setStep("card")}
          />
        </View>
      ) : step === "momo" ? (
        <View className="gap-3">
          <AppText variant="label">{t("network")}</AppText>
          {networksFailed ? (
            <View className="gap-2 rounded-xl border border-border bg-card p-3">
              <AppText variant="small" tone="muted">
                {t("couldnTLoadTheMobileMoney")}
              </AppText>
              <Button
                title={t("retry")}
                size="sm"
                variant="outline"
                onPress={() => networks.refetch()}
              />
            </View>
          ) : null}
          <View className="flex-row flex-wrap gap-2">
            {networkList.map((n) => {
              const selected = n.code === networkCode;
              return (
                <Pressable
                  accessibilityRole="button"
                  key={n.code}
                  onPress={() => setNetworkCode(n.code)}
                  className={`rounded-full border px-3 py-1.5 ${
                    selected
                      ? "border-primary bg-primary"
                      : "border-border bg-background"
                  }`}
                >
                  <AppText
                    variant="small"
                    className={
                      selected ? "text-primary-foreground" : "text-foreground"
                    }
                  >
                    {n.name}
                  </AppText>
                </Pressable>
              );
            })}
            {networks.isLoading ? <ActivityIndicator /> : null}
          </View>

          <Input
            value={phone}
            onChangeText={setPhone}
            placeholder={t("n024xxxxxxx")}
            keyboardType="phone-pad"
            autoCapitalize="none"
            invalid={!!formError}
          />

          {formError ? (
            <AppText variant="small" tone="error">
              {formError}
            </AppText>
          ) : null}

          <Button
            title={t("saveWallet")}
            fullWidth
            loading={addMomo.isPending || finishing}
            disabled={
              addMomo.isPending || finishing || networkList.length === 0
            }
            onPress={submitMomo}
          />
        </View>
      ) : (
        <View className="gap-3">
          <AppText variant="muted">{t("addingACardRunsASmall")}</AppText>

          {formError ? (
            <AppText variant="small" tone="error">
              {formError}
            </AppText>
          ) : null}

          <Button
            title={t("startCardVerification")}
            fullWidth
            loading={addCard.isPending || finishing}
            onPress={startCardVerification}
          />
          <Button
            title={t("cancel")}
            variant="outline"
            fullWidth
            onPress={close}
          />
        </View>
      )}
    </Sheet>
  );
}
