import { useMarket } from "@/features/markets/MarketProvider";
import { MomoCodeStep } from "@/features/wallet/MomoCodeStep";
import {
  useAddCard,
  useAddMomoWallet,
  useMomoNetworks,
} from "@/features/wallet/usePaymentMethods";
import { api } from "@/lib/api";
import type { MomoNetwork, PaymentMethodRow } from "@abonten/api-client";
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
// fill form -> (mobile money: the code texted to the number, unless it is
// the person's own verified phone) -> success, the native echo of the web
// AddPaymentMethodPopup two-step shell. Used by the Wallets screen and by the payment picker at
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
  // Set once a code has been texted to the number: the code step shows.
  const [codeFor, setCodeFor] = useState<{
    phoneE164: string;
    codeLength: number;
  } | null>(null);
  const [codeNote, setCodeNote] = useState<string | null>(null);
  const [requesting, setRequesting] = useState(false);
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
    setCodeFor(null);
    setCodeNote(null);
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

  async function saveMomo(net: MomoNetwork, code?: string) {
    setFormError(null);
    try {
      const res = await addMomo.mutateAsync({
        networkCode: net.code,
        networkName: net.name,
        phone: phone.trim(),
        ...(code ? { code } : {}),
      });
      if (res.status === 200) {
        await added(res.data, t("mobileMoneyWalletAdded"));
        return;
      }
      // Covers a wrong or expired code, a duplicate wallet and any
      // server-side validation failure.
      setFormError(res.message ?? t("weCouldnTAddThatWallet"));
    } catch {
      setFormError(t("weCouldnTAddThatWallet"));
    }
  }

  // Texts a code to the number; the person's own verified phone needs none
  // and is saved at once (payments/mobileMoneyNumberCheck).
  async function requestCode(net: MomoNetwork, resend: boolean) {
    setFormError(null);
    setRequesting(true);
    try {
      const res = await api.paymentMethods.momoCode({
        phone: phone.trim(),
        use: "wallet",
      });
      if (res.status !== 200 || !res.data) {
        setFormError(res.message ?? t("weCouldnTAddThatWallet"));
        return;
      }
      if (!res.data.needsCode) {
        await saveMomo(net);
        return;
      }
      setCodeNote(resend ? t("aNewCodeIsOnItsWay") : null);
      setCodeFor({
        phoneE164: res.data.phoneE164,
        codeLength: res.data.codeLength,
      });
    } catch {
      setFormError(t("weCouldnTAddThatWallet"));
    } finally {
      setRequesting(false);
    }
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
    await requestCode(net, false);
  }

  const chosenNetwork = networkList.find((n) => n.code === networkCode);

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
              // From the code, back to the number; from a form, back to
              // the choice of wallet.
              if (codeFor) setCodeFor(null);
              else setStep("choose");
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
      ) : step === "momo" && codeFor && chosenNetwork ? (
        <MomoCodeStep
          phoneE164={codeFor.phoneE164}
          codeLength={codeFor.codeLength}
          submitTitle={t("saveWallet")}
          busy={addMomo.isPending || requesting || finishing}
          error={formError}
          note={codeNote}
          onSubmit={(code) => void saveMomo(chosenNetwork, code)}
          onResend={() => void requestCode(chosenNetwork, true)}
          onChangeNumber={() => {
            setFormError(null);
            setCodeFor(null);
          }}
        />
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
          <AppText variant="small" tone="muted">
            {t("weLlTextACodeToThis")}
          </AppText>

          {formError ? (
            <AppText variant="small" tone="error">
              {formError}
            </AppText>
          ) : null}

          <Button
            title={t("continueText")}
            fullWidth
            loading={addMomo.isPending || requesting || finishing}
            disabled={
              addMomo.isPending ||
              requesting ||
              finishing ||
              networkList.length === 0
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
