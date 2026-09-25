import { api } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { DEFAULT_PHONE_OTP_CODE_LENGTH } from "@abonten/core/otpConstants";
import { AppText, Button, Field, Input, OtpInput } from "@abonten/ui-native";
import { useState } from "react";
import { View } from "react-native";

// Add or change the account's phone number: a code by text message, checked
// on the server (/api/mobile/account/phone/* → updateVerifiedPhoneCore,
// which attaches the number already verified). Used by Settings › Security
// and Account setup. Once it's on the account, the number can be used to
// sign in with a code.

const DEFAULT_DIAL_CODE = "+233";

export function PhoneVerificationForm({
  onDone,
  onCancel,
}: {
  onDone: (message: string) => void;
  onCancel?: () => void;
}) {
  const [dialCode, setDialCode] = useState(DEFAULT_DIAL_CODE);
  const [rawPhone, setRawPhone] = useState("");
  const [phoneE164, setPhoneE164] = useState<string | null>(null);
  const [codeLength, setCodeLength] = useState(DEFAULT_PHONE_OTP_CODE_LENGTH);
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentNote, setSentNote] = useState<string | null>(null);

  async function sendCode() {
    setError(null);
    if (rawPhone.trim().length < 6) {
      setError("Enter your phone number.");
      return;
    }
    setBusy(true);
    try {
      const res = await api.account.requestPhoneChange({
        dialCode: dialCode.trim(),
        rawPhone: rawPhone.trim(),
      });
      if (res.status !== 200 || !res.data) {
        setError(res.message ?? "Couldn't send a code. Try again.");
        return;
      }
      if (phoneE164) setSentNote(`A new code is on its way to ${phoneE164}.`);
      setPhoneE164(res.data.phoneE164);
      setCodeLength(res.data.codeLength);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  // `code` comes from OtpInput's onComplete (the final digit's state update
  // hasn't flushed yet when it fires); the Verify button uses `otp`.
  async function verify(code?: string) {
    if (!phoneE164) return;
    const value = (code ?? otp).trim();
    if (value.length < codeLength) return;
    setError(null);
    setBusy(true);
    try {
      const res = await api.account.verifyPhoneChange({
        phoneE164,
        code: value,
      });
      if (res.status !== 200) {
        setError(res.message ?? "That code didn't work. Try again.");
        return;
      }
      // Pull the new phone claim into the local session.
      await supabase.auth.refreshSession();
      onDone("Phone number verified.");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (phoneE164) {
    return (
      <View className="gap-3">
        <Field label={`Enter the code sent to ${phoneE164}`}>
          <OtpInput
            value={otp}
            onChange={setOtp}
            onComplete={verify}
            length={codeLength}
            disabled={busy}
            invalid={!!error}
          />
        </Field>
        {sentNote ? <AppText variant="small">{sentNote}</AppText> : null}
        {error ? (
          <AppText variant="small" tone="error">
            {error}
          </AppText>
        ) : null}
        <View className="flex-row flex-wrap gap-2">
          <Button
            title={busy ? "Verifying…" : "Verify"}
            onPress={() => verify()}
            disabled={busy || otp.trim().length < codeLength}
          />
          <Button
            title="Resend code"
            variant="outline"
            onPress={sendCode}
            disabled={busy}
          />
          <Button
            title="Change number"
            variant="ghost"
            onPress={() => {
              setPhoneE164(null);
              setOtp("");
              setError(null);
              setSentNote(null);
            }}
            disabled={busy}
          />
        </View>
      </View>
    );
  }

  return (
    <View className="gap-3">
      <View className="flex-row gap-2">
        <View className="w-20">
          <Field label="Code">
            <Input
              value={dialCode}
              onChangeText={setDialCode}
              keyboardType="phone-pad"
              accessibilityLabel="Country code"
            />
          </Field>
        </View>
        <View className="flex-1">
          <Field label="Phone number">
            <Input
              value={rawPhone}
              onChangeText={setRawPhone}
              placeholder="24 123 4567"
              keyboardType="phone-pad"
              textContentType="telephoneNumber"
              autoComplete="tel"
            />
          </Field>
        </View>
      </View>
      {error ? (
        <AppText variant="small" tone="error">
          {error}
        </AppText>
      ) : null}
      <View className="flex-row gap-2">
        <Button
          title={busy ? "Sending…" : "Send code"}
          onPress={sendCode}
          disabled={busy}
        />
        {onCancel ? (
          <Button
            title="Cancel"
            variant="outline"
            onPress={onCancel}
            disabled={busy}
          />
        ) : null}
      </View>
    </View>
  );
}
