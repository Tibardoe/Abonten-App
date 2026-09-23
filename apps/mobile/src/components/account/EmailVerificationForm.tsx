import { useSession } from "@/auth/SessionProvider";
import { supabase } from "@/lib/supabase";
import {
  EMAIL_OTP_CODE_LENGTH,
  EMAIL_OTP_MESSAGES,
  isLikelyEmail,
  maskEmail,
} from "@abonten/core/emailOtp";
import { AppText, Button, Field, Input, OtpInput } from "@abonten/ui-native";
import { useState } from "react";
import { View } from "react-native";

// Add, change or confirm the account's email with a 6-digit code, without
// signing out. Used by Settings › Security, Account setup and checkout.
//
//   * add / change: supabase.auth.updateUser({ email }) mails a code to the
//     new address (verifyOtp type "email_change"). With Secure email change
//     on, Supabase also mails the current address and the change completes
//     only once both codes are in — the second step below.
//   * a change already waiting (user.new_email, e.g. the app was closed
//     half-way): opens straight on the code step, with Resend.
//   * an address on the account that was never confirmed: a sign-in code to
//     that same address (signInWithOtp, shouldCreateUser false) confirms it.
//
// The "Confirm email change" email template must carry {{ .Token }} — see
// docs/architecture/email-auth.md.

type Phase =
  | { step: "enter" }
  | { step: "code"; target: string; mode: "change-new" | "change-current" }
  | { step: "code"; target: string; mode: "confirm" };

export function EmailVerificationForm({
  onDone,
  onCancel,
}: {
  onDone: (message: string) => void;
  onCancel?: () => void;
}) {
  const { session } = useSession();
  const user = session?.user;
  const currentEmail = user?.email ?? null;
  const pendingEmail = (user as { new_email?: string | null } | undefined)
    ?.new_email;
  const unconfirmed = !!currentEmail && !user?.email_confirmed_at;

  const [phase, setPhase] = useState<Phase>(
    pendingEmail
      ? { step: "code", target: pendingEmail, mode: "change-new" }
      : { step: "enter" },
  );
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentNote, setSentNote] = useState<string | null>(null);

  async function sendChange(next: string) {
    const { error: e } = await supabase.auth.updateUser({ email: next });
    if (e) {
      const conflict =
        e.status === 422 ||
        /already.*(registered|exists|in use)/i.test(e.message);
      setError(
        conflict
          ? "That email can't be used."
          : "Couldn't send a code. Please try again.",
      );
      return false;
    }
    return true;
  }

  async function startChange() {
    setError(null);
    const next = email.trim().toLowerCase();
    if (!isLikelyEmail(next)) {
      setError("Enter a valid email address.");
      return;
    }
    if (next === currentEmail) {
      setError("That's already your email address.");
      return;
    }
    setBusy(true);
    try {
      if (await sendChange(next)) {
        setOtp("");
        setPhase({ step: "code", target: next, mode: "change-new" });
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function startConfirm() {
    if (!currentEmail) return;
    setError(null);
    setBusy(true);
    try {
      const { error: e } = await supabase.auth.signInWithOtp({
        email: currentEmail,
        options: { shouldCreateUser: false },
      });
      if (e) {
        setError("Couldn't send a code. Please try again.");
        return;
      }
      setOtp("");
      setPhase({ step: "code", target: currentEmail, mode: "confirm" });
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    if (phase.step !== "code") return;
    setError(null);
    setBusy(true);
    try {
      if (phase.mode === "confirm") {
        await supabase.auth.signInWithOtp({
          email: phase.target,
          options: { shouldCreateUser: false },
        });
      } else if (!(await sendChange(phase.target))) {
        return;
      }
      setSentNote(`A new code is on its way to ${maskEmail(phase.target)}.`);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  // `value` comes from OtpInput's onComplete (the last digit's state update
  // hasn't flushed yet when it fires); the Verify button uses `otp`.
  async function verify(value?: string) {
    if (phase.step !== "code") return;
    const token = (value ?? otp).trim();
    if (token.length < EMAIL_OTP_CODE_LENGTH) return;
    setError(null);
    setBusy(true);
    try {
      const { data, error: e } = await supabase.auth.verifyOtp({
        email: phase.target,
        token,
        type: phase.mode === "confirm" ? "email" : "email_change",
      });
      if (e) {
        setError(EMAIL_OTP_MESSAGES.invalidOrExpired);
        return;
      }
      if (phase.mode === "change-new" && !data.user?.email_confirmed_at) {
        // Secure email change: the current address must confirm too.
        if (currentEmail) {
          setOtp("");
          setSentNote(null);
          setPhase({
            step: "code",
            target: currentEmail,
            mode: "change-current",
          });
          return;
        }
      }
      await supabase.auth.refreshSession();
      onDone(phase.mode === "confirm" ? "Email verified." : "Email updated.");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (phase.step === "code") {
    const label =
      phase.mode === "change-current"
        ? `One more code — sent to your current address (${maskEmail(phase.target)})`
        : `Enter the code sent to ${maskEmail(phase.target)}`;
    return (
      <View className="gap-3">
        <Field label={label}>
          <OtpInput
            value={otp}
            onChange={setOtp}
            onComplete={verify}
            length={EMAIL_OTP_CODE_LENGTH}
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
            disabled={busy || otp.trim().length < EMAIL_OTP_CODE_LENGTH}
          />
          {phase.mode !== "change-current" ? (
            <Button
              title="Resend code"
              variant="outline"
              onPress={resend}
              disabled={busy}
            />
          ) : null}
          {phase.mode === "change-new" ? (
            <Button
              title="Use a different email"
              variant="ghost"
              onPress={() => {
                setError(null);
                setSentNote(null);
                setPhase({ step: "enter" });
              }}
              disabled={busy}
            />
          ) : onCancel ? (
            <Button
              title="Cancel"
              variant="ghost"
              onPress={onCancel}
              disabled={busy}
            />
          ) : null}
        </View>
      </View>
    );
  }

  return (
    <View className="gap-3">
      {unconfirmed ? (
        <View className="gap-2 rounded-lg bg-muted p-3">
          <AppText variant="small">
            {currentEmail} isn't confirmed yet. We'll send a code to it.
          </AppText>
          <Button
            title={busy ? "Sending…" : "Send code"}
            variant="outline"
            onPress={startConfirm}
            disabled={busy}
          />
        </View>
      ) : null}
      <Field label={currentEmail ? "New email" : "Email"}>
        <Input
          value={email}
          onChangeText={setEmail}
          placeholder="you@example.com"
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          textContentType="emailAddress"
          returnKeyType="send"
          onSubmitEditing={startChange}
        />
      </Field>
      {error ? (
        <AppText variant="small" tone="error">
          {error}
        </AppText>
      ) : null}
      <View className="flex-row gap-2">
        <Button
          title={busy ? "Sending…" : "Send code"}
          onPress={startChange}
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
