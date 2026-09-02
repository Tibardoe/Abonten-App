import { api } from "@/lib/api";
import { hapticError, hapticSuccess } from "@/lib/haptics";
import { supabase } from "@/lib/supabase";
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

const CODE_LENGTH = 6;
const RESEND_SECONDS = 30;

// Mask all but the last two digits of the destination so the screen confirms
// which number was used without printing it in full.
function maskPhone(e164: string | undefined) {
  if (!e164) return "your phone";
  const tail = e164.slice(-2);
  const head = e164.slice(0, Math.max(0, e164.length - 6));
  return `${head}••••${tail}`;
}

export default function Verify() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { phoneE164, dialCode, rawPhone } = useLocalSearchParams<{
    phoneE164: string;
    dialCode?: string;
    rawPhone?: string;
  }>();

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
      if (!phoneE164) {
        setError("Missing phone number — go back and try again.");
        return;
      }
      if (value.length < CODE_LENGTH) return;
      setError(null);
      setNotice(null);
      setBusy(true);
      try {
        const res = await api.auth.verifyPhoneOtp({ phoneE164, code: value });

        if (res.status !== 200 || !res.data) {
          hapticError();
          setError(res.message ?? "That code didn't work. Try again.");
          setCode("");
          return;
        }

        // Persist the returned session — SessionProvider's onAuthStateChange
        // then routes into the app.
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
    [phoneE164],
  );

  async function resend() {
    if (secondsLeft > 0 || resending || busy) return;
    if (!dialCode || !rawPhone) {
      setError("Go back and re-enter your number to get a new code.");
      return;
    }
    setError(null);
    setNotice(null);
    setResending(true);
    try {
      const res = await api.auth.requestPhoneOtp({ dialCode, rawPhone });
      if (res.status !== 200 || !res.data) {
        setError(res.message ?? "Couldn't resend the code. Try again.");
        return;
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
          style={{ marginTop: insets.top + 4, marginLeft: 8 }}
          className="h-11 w-11 items-center justify-center rounded-full active:opacity-60"
        >
          <Icon name="arrow-back" size={24} tone="foreground" />
        </Pressable>

        <ScrollView
          contentContainerClassName="grow px-6 pb-10"
          keyboardShouldPersistTaps="handled"
        >
          <View className="items-center gap-3 pb-2 pt-2">
            <AbontenLogo size={48} />
            <AbontenWordmark size={20} />
          </View>

          <View className="grow justify-center gap-8">
            <View className="gap-2">
              <AppText className="text-center text-[26px] font-bold text-foreground">
                Enter your code
              </AppText>
              <AppText className="text-center text-[14px] leading-[20px] text-muted-foreground">
                We sent a {CODE_LENGTH}-digit code to {maskPhone(phoneE164)}.
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
                length={CODE_LENGTH}
                disabled={busy}
                invalid={!!error}
              />

              {error ? (
                <View className="flex-row items-center justify-center gap-1.5">
                  <Icon name="alert-circle" size={15} tone="destructive" />
                  <AppText className="text-[13px] text-destructive">
                    {error}
                  </AppText>
                </View>
              ) : notice ? (
                <View className="flex-row items-center justify-center gap-1.5">
                  <Icon name="checkmark-circle" size={15} tone="primary" />
                  <AppText className="text-[13px] text-muted-foreground">
                    {notice}
                  </AppText>
                </View>
              ) : null}
            </View>

            <View className="gap-4">
              <Button
                title={busy ? "Verifying…" : "Verify"}
                fullWidth
                loading={busy}
                disabled={busy || code.length < CODE_LENGTH}
                onPress={() => verify(code)}
              />

              <Pressable
                onPress={resend}
                disabled={secondsLeft > 0 || resending || busy}
                hitSlop={8}
                className="active:opacity-60"
              >
                <AppText className="text-center text-[13px] text-muted-foreground">
                  {resending
                    ? "Sending…"
                    : secondsLeft > 0
                      ? `Resend code in ${secondsLeft}s`
                      : "Resend code"}
                </AppText>
              </Pressable>

              <Pressable onPress={() => router.back()} disabled={busy}>
                <AppText className="text-center text-[13px] font-semibold text-primary">
                  Use a different number
                </AppText>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}
