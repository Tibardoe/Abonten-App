import { formatPhoneInternational } from "@abonten/core/phone/phone";
import { AppText, Button, Field, OtpInput } from "@abonten/ui-native";
import { useTranslations } from "@abonten/ui-native/i18n";
import { useState } from "react";
import { View } from "react-native";

// Second step of saving a mobile money number (a wallet, or a payout
// account): the code texted to it (payments/mobileMoneyNumberCheck). The
// parent sends the code with the save, resends, or goes back to the number.
export function MomoCodeStep({
  phoneE164,
  codeLength,
  submitTitle,
  busy,
  error,
  note,
  onSubmit,
  onResend,
  onChangeNumber,
}: {
  phoneE164: string;
  codeLength: number;
  /** "Save wallet", "Save payout account"… */
  submitTitle: string;
  busy: boolean;
  error: string | null;
  /** E.g. "A new code is on its way." after a resend. */
  note?: string | null;
  onSubmit: (code: string) => void;
  onResend: () => void;
  onChangeNumber: () => void;
}) {
  const t = useTranslations("wallet");
  const [otp, setOtp] = useState("");

  // `code` comes from OtpInput's onComplete (the last digit's state update
  // has not flushed yet when it fires); the button uses `otp`.
  const submit = (code?: string) => {
    const value = (code ?? otp).trim();
    if (value.length < codeLength || busy) return;
    onSubmit(value);
  };

  return (
    <View className="gap-3">
      <AppText variant="muted">{t("thisChecksTheNumberIsRight")}</AppText>
      <Field
        label={t("enterTheCodeWeSentTo", {
          phone: formatPhoneInternational(phoneE164),
        })}
      >
        <OtpInput
          value={otp}
          onChange={setOtp}
          onComplete={submit}
          length={codeLength}
          disabled={busy}
          invalid={!!error}
        />
      </Field>
      {note ? <AppText variant="small">{note}</AppText> : null}
      {error ? (
        <AppText variant="small" tone="error">
          {error}
        </AppText>
      ) : null}
      <Button
        title={submitTitle}
        fullWidth
        loading={busy}
        disabled={busy || otp.trim().length < codeLength}
        onPress={() => submit()}
      />
      <View className="flex-row gap-2">
        <Button
          title={t("resendCode")}
          variant="outline"
          className="flex-1"
          disabled={busy}
          onPress={() => {
            setOtp("");
            onResend();
          }}
        />
        <Button
          title={t("changeNumber")}
          variant="ghost"
          className="flex-1"
          disabled={busy}
          onPress={onChangeNumber}
        />
      </View>
    </View>
  );
}
