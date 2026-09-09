import { api } from "@/lib/api";
import { hapticError, hapticSuccess } from "@/lib/haptics";
import { supabase } from "@/lib/supabase";
import {
  EMAIL_OTP_CODE_LENGTH,
  EMAIL_OTP_MESSAGES,
  maskEmail,
} from "@abonten/core/emailOtp";
import { HUBTEL_OTP_CODE_LENGTH } from "@abonten/core/otpConstants";
import {
  AbontenLogo,
  AbontenWordmark,
  AppText,
  Button,
  Icon,
  OtpInput,
} from "@abonten/ui-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// Must not be shorter than the shortest interval either provider will
// actually honour, or the button re-enables into a guaranteed failure:
//   * email — Supabase refuses a second send inside 60s (measured against
//     the live project 2026-09-09: 35s and 50s -> 429, 65s -> 200), and
//   * phone — phoneOtpStore.ts enforces its own RESEND_COOLDOWN_MS of 60s.
// At the old 30s a tap between 30s and 60s returned "Too many requests" and
// still consumed one of the three sends requestEmailOtpCore allows per 15
// minutes, so two impatient taps could lock a real user out of resending
// for the rest of that window. Web already uses 60s (ResendOtpButton).
const RESEND_SECONDS = 60;

// Mask all but the last two digits of a phone number so the screen confirms
// which number was used without printing it in full.
function maskPhone(e164: string | undefined) {
  if (!e164) return "your phone";
  const tail = e164.slice(-2);
  const head = e164.slice(0, Math.max(0, e164.length - 6));
  return `${head}••••${tail}`;
}

// Shared OTP screen for both sign-in channels:
//   channel === "phone" (default) — Hubtel 4-digit code, verified through
//     /api/mobile/auth/phone/verify, which returns session tokens we
//     setSession() with.
//   channel === "email" — Supabase 6-digit code, verified directly against
//     Supabase (supabase.auth.verifyOtp), which persists the session to
//     secure-store itself. No server round-trip on verify.
export default function Verify() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    channel?: "phone" | "email";
    phoneE164?: string;
    dialCode?: string;
    rawPhone?: string;
    email?: string;
  }>();

  const channel = params.channel === "email" ? "email" : "phone";
  const { phoneE164, dialCode, rawPhone, email } = params;

  const codeLength =
    channel === "email" ? EMAIL_OTP_CODE_LENGTH : HUBTEL_OTP_CODE_LENGTH;
  const destination =
    channel === "email"
      ? email
        ? maskEmail(email)
        : "your email"
      : maskPhone(phoneE164);

  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(RESEND_SECONDS);

  // Single countdown interval, (re)started on mount and after each resend.
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startCountdown = useCallback(() => {
    setSecondsLeft(RESEND_SECONDS);
    if (tickRef.current) clearInterval(tickRef.current);
    tickRef.current = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1 && tickRef.current) {
          clearInterval(tickRef.current);
          tickRef.current = null;
          return 0;
        }
        return s - 1;
      });
    }, 1000);
  }, []);

  useEffect(() => {
    startCountdown();
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, [startCountdown]);

  const verify = useCallback(
    async (value: string) => {
      if (value.length < codeLength) return;
      setError(null);
      setNotice(null);
      setBusy(true);
      try {
        if (channel === "email") {
          if (!email) {
            setError("Missing email — go back and try again.");
            return;
          }
          // verifyOtp persists the session to secure-store on success;
          // SessionProvider's onAuthStateChange then routes into the app.
          const { error: verifyErr } = await supabase.auth.verifyOtp({
            email: email.trim().toLowerCase(),
            token: value,
            type: "email",
          });
          if (verifyErr) {
            hapticError();
            setError(EMAIL_OTP_MESSAGES.invalidOrExpired);
            setCode("");
            return;
          }
          hapticSuccess();
          return;
        }

        if (!phoneE164) {
          setError("Missing phone number — go back and try again.");
          return;
        }
        const res = await api.auth.verifyPhoneOtp({ phoneE164, code: value });

        if (res.status !== 200 || !res.data) {
          hapticError();
          setError(res.message ?? "That code didn't work. Try again.");
          setCode("");
          return;
        }

        const { error: setErr } = await supabase.auth.setSession({
          access_token: res.data.access_token,
          refresh_token: res.data.refresh_token,
        });

        if (setErr) {
          hapticError();
          setError("Signed in, but the session couldn't be saved. Try again.");
          return;
        }
        hapticSuccess();
      } catch {
        hapticError();
        setError("Network error. Check your connection and try again.");
      } finally {
        setBusy(false);
      }
    },
    [channel, phoneE164, email, codeLength],
  );

  async function resend() {
    if (secondsLeft > 0 || resending || busy) return;
    setError(null);
    setNotice(null);
    setResending(true);
    try {
      if (channel === "email") {
        if (!email) {
          setError("Go back and re-enter your email to get a new code.");
          return;
        }
        const res = await api.auth.requestEmailOtp({ email: email.trim() });
        if (res.status !== 200) {
          setError(res.message ?? "Couldn't resend the code. Try again.");
          return;
        }
      } else {
        if (!dialCode || !rawPhone) {
          setError("Go back and re-enter your number to get a new code.");
          return;
        }
        const res = await api.auth.requestPhoneOtp({ dialCode, rawPhone });
        if (res.status !== 200 || !res.data) {
          setError(res.message ?? "Couldn't resend the code. Try again.");
          return;
        }
      }
      setCode("");
      setNotice("A new code is on its way.");
      startCountdown();
    } catch {
      setError("Network error. Check your connection and try again.");
    } finally {
      setResending(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View className="flex-1 bg-background">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={() => router.back()}
          disabled={busy}
          hitSlop={10}
          style={{
            position: "absolute",
            top: insets.top + 4,
            left: 8,
            zIndex: 10,
          }}
          className="h-11 w-11 items-center justify-center rounded-full active:opacity-60"
        >
          <Icon name="arrow-back" size={24} tone="foreground" />
        </Pressable>

        <ScrollView
          contentContainerStyle={{
            flexGrow: 1,
            justifyContent: "center",
            paddingHorizontal: 24,
            paddingTop: insets.top + 56,
            paddingBottom: 32,
          }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View className="gap-8">
            <View className="items-center gap-3">
              <AbontenLogo size={48} />
              <AbontenWordmark size={20} />
            </View>

            <View className="gap-2">
              <AppText variant="pageTitle" className="text-center">
                Enter your code
              </AppText>
              <AppText variant="muted" className="text-center">
                We sent a {codeLength}-digit code to {destination}.
              </AppText>
            </View>

            <View className="gap-3">
              <OtpInput
                value={code}
                onChange={(v) => {
                  setCode(v);
                  if (error) setError(null);
                }}
                onComplete={verify}
                length={codeLength}
                disabled={busy}
                invalid={!!error}
              />

              {error ? (
                <View className="flex-row items-center justify-center gap-1.5">
                  <Icon name="alert-circle" size={15} tone="destructive" />
                  <AppText variant="small" tone="error">
                    {error}
                  </AppText>
                </View>
              ) : notice ? (
                <View className="flex-row items-center justify-center gap-1.5">
                  <Icon name="checkmark-circle" size={15} tone="primary" />
                  <AppText variant="muted">{notice}</AppText>
                </View>
              ) : null}
            </View>

            <View className="gap-4">
              <Button
                title={busy ? "Verifying…" : "Verify"}
                fullWidth
                loading={busy}
                disabled={busy || code.length < codeLength}
                onPress={() => verify(code)}
              />

              <Pressable
                onPress={resend}
                disabled={secondsLeft > 0 || resending || busy}
                hitSlop={8}
                className="active:opacity-60"
              >
                <AppText variant="muted" className="text-center">
                  {resending
                    ? "Sending…"
                    : secondsLeft > 0
                      ? `Resend code in ${secondsLeft}s`
                      : "Resend code"}
                </AppText>
              </Pressable>

              <Pressable onPress={() => router.back()} disabled={busy}>
                <AppText
                  variant="small"
                  tone="brand"
                  className="text-center font-semibold"
                >
                  {channel === "email"
                    ? "Use a different email"
                    : "Use a different number"}
                </AppText>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}
