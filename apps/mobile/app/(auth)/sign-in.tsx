import { CountryCodeField } from "@/auth/CountryCodeField";
import { GoogleIcon } from "@/auth/GoogleIcon";
import { signInWithGoogle } from "@/auth/googleSignIn";
import { api } from "@/lib/api";
import { type Country, DEFAULT_COUNTRY } from "@abonten/core/countries";
import {
  AbontenLogo,
  AbontenWordmark,
  AppText,
  Button,
  Icon,
} from "@abonten/ui-native";
import { useThemeColors } from "@abonten/ui-native/theme";
import { useRouter } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function SignIn() {
  const router = useRouter();
  const c = useThemeColors();
  const insets = useSafeAreaInsets();
  const [country, setCountry] = useState<Country>(DEFAULT_COUNTRY);
  const [rawPhone, setRawPhone] = useState("");
  const [busy, setBusy] = useState<"phone" | "google" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const phoneValid = rawPhone.replace(/\D/g, "").length >= 6;

  async function sendCode() {
    if (!phoneValid) {
      setError("Enter your phone number.");
      return;
    }
    setError(null);
    setBusy("phone");
    try {
      const res = await api.auth.requestPhoneOtp({
        dialCode: country.callingCode,
        rawPhone: rawPhone.trim(),
      });

      if (res.status !== 200 || !res.data) {
        setError(res.message ?? "Couldn't send the code. Try again.");
        return;
      }

      router.push({
        pathname: "/(auth)/verify",
        params: { phoneE164: res.data.phoneE164 },
      });
    } catch {
      setError("Network error. Check your connection and try again.");
    } finally {
      setBusy(null);
    }
  }

  async function google() {
    setError(null);
    setBusy("google");
    try {
      const res = await signInWithGoogle();
      if (!res.ok) setError(res.message);
      // On success SessionProvider's onAuthStateChange routes into the app.
    } finally {
      setBusy(null);
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
          accessibilityLabel={router.canGoBack() ? "Back" : "Close"}
          onPress={() =>
            router.canGoBack() ? router.back() : router.replace("/(app)/(tabs)")
          }
          hitSlop={10}
          style={{ marginTop: insets.top + 4, marginLeft: 8 }}
          className="h-11 w-11 items-center justify-center rounded-full active:opacity-60"
        >
          <Icon
            name={router.canGoBack() ? "arrow-back" : "close"}
            size={24}
            tone="foreground"
          />
        </Pressable>

        <ScrollView
          contentContainerClassName="grow justify-center gap-7 px-6 pb-10 pt-6"
          keyboardShouldPersistTaps="handled"
        >
          <View className="items-center gap-3">
            <AbontenLogo size={52} />
            <AbontenWordmark size={22} />
          </View>

          <View className="gap-1.5">
            <AppText className="text-center text-[24px] font-bold text-foreground">
              Log in or sign up
            </AppText>
            <AppText className="text-center text-[14px] text-muted-foreground">
              Continue with your phone number or Google account.
            </AppText>
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Continue with Google"
            disabled={busy !== null}
            onPress={google}
            className="h-[52px] flex-row items-center justify-center gap-3 rounded-lg border border-border bg-card active:opacity-80 disabled:opacity-50"
          >
            {busy === "google" ? (
              <ActivityIndicator />
            ) : (
              <>
                <GoogleIcon size={20} />
                <AppText className="text-[15px] font-semibold text-foreground">
                  Continue with Google
                </AppText>
              </>
            )}
          </Pressable>

          <View className="flex-row items-center gap-3">
            <View className="h-px flex-1 bg-border" />
            <AppText className="text-[11px] uppercase tracking-wide text-muted-foreground">
              or
            </AppText>
            <View className="h-px flex-1 bg-border" />
          </View>

          <View className="gap-2">
            <AppText variant="label">Phone number</AppText>
            <View className="flex-row gap-2">
              <CountryCodeField value={country} onChange={setCountry} />
              <TextInput
                className="h-[48px] flex-1 rounded-lg border border-input bg-background px-3 text-[15px] text-foreground"
                placeholder="24 123 4567"
                placeholderTextColor={c["muted-foreground"]}
                keyboardType="phone-pad"
                autoComplete="tel"
                value={rawPhone}
                onChangeText={(v) => {
                  setRawPhone(v);
                  if (error) setError(null);
                }}
                editable={busy === null}
                onSubmitEditing={sendCode}
                returnKeyType="send"
              />
            </View>

            {error ? (
              <AppText className="text-[13px] text-destructive">
                {error}
              </AppText>
            ) : null}

            <Button
              title={busy === "phone" ? "Sending code…" : "Send code"}
              fullWidth
              loading={busy === "phone"}
              disabled={busy !== null || !phoneValid}
              onPress={sendCode}
              className="mt-1"
            />
          </View>

          <AppText className="text-center text-[12px] text-muted-foreground">
            By continuing you agree to Abonten's Terms and Privacy Policy.
          </AppText>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}
