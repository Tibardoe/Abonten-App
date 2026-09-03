import { CountryCodeField } from "@/auth/CountryCodeField";
import { GoogleIcon } from "@/auth/GoogleIcon";
import { signInWithGoogle } from "@/auth/googleSignIn";
import { api } from "@/lib/api";
import { hapticError } from "@/lib/haptics";
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
  Linking,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const TERMS_URL = "https://abonten.com/terms";
const PRIVACY_URL = "https://abonten.com/privacy";

export default function SignIn() {
  const router = useRouter();
  const c = useThemeColors();
  const insets = useSafeAreaInsets();
  const [country, setCountry] = useState<Country>(DEFAULT_COUNTRY);
  const [rawPhone, setRawPhone] = useState("");
  const [busy, setBusy] = useState<"phone" | "google" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [phoneFocused, setPhoneFocused] = useState(false);

  const phoneValid = rawPhone.replace(/\D/g, "").length >= 6;

  async function sendCode() {
    if (!phoneValid) {
      hapticError();
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
        hapticError();
        setError(res.message ?? "Couldn't send the code. Try again.");
        return;
      }

      router.push({
        pathname: "/(auth)/verify",
        params: {
          phoneE164: res.data.phoneE164,
          // Carried so the verify screen's "Resend code" can re-request
          // without bouncing the user back here.
          dialCode: country.callingCode,
          rawPhone: rawPhone.trim(),
        },
      });
    } catch {
      hapticError();
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
      if (!res.ok) {
        hapticError();
        setError(res.message);
      }
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
          style={{
            position: "absolute",
            top: insets.top + 4,
            left: 8,
            zIndex: 10,
          }}
          className="h-11 w-11 items-center justify-center rounded-full active:opacity-60"
        >
          <Icon
            name={router.canGoBack() ? "arrow-back" : "close"}
            size={24}
            tone="foreground"
          />
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
          <View className="gap-7">
            <View className="items-center gap-3">
              <AbontenLogo size={52} />
              <AbontenWordmark size={22} />
            </View>

            <View className="gap-2">
              <AppText variant="pageTitle" className="text-center">
                Log in or sign up
              </AppText>
              <AppText variant="muted" className="text-center">
                Continue with your phone number or Google account.
              </AppText>
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Continue with Google"
              disabled={busy !== null}
              onPress={google}
              className="h-14 flex-row items-center justify-center gap-3 rounded-xl border border-border bg-card active:opacity-80 disabled:opacity-50"
            >
              {busy === "google" ? (
                <ActivityIndicator />
              ) : (
                <>
                  <GoogleIcon size={20} />
                  <AppText variant="bodyStrong">Continue with Google</AppText>
                </>
              )}
            </Pressable>

            <View className="flex-row items-center gap-3">
              <View className="h-px flex-1 bg-border" />
              <AppText variant="overline">or</AppText>
              <View className="h-px flex-1 bg-border" />
            </View>

            <View className="gap-3 rounded-2xl border border-border bg-card p-4">
              <AppText variant="label">Phone number</AppText>
              <View className="flex-row gap-2">
                <CountryCodeField value={country} onChange={setCountry} />
                <TextInput
                  className={[
                    "h-[52px] flex-1 rounded-xl border bg-background px-3 text-[16px] text-foreground",
                    error
                      ? "border-destructive"
                      : phoneFocused
                        ? "border-ring"
                        : "border-input",
                  ].join(" ")}
                  placeholder="24 123 4567"
                  placeholderTextColor={c["muted-foreground"]}
                  keyboardType="phone-pad"
                  autoComplete="tel"
                  value={rawPhone}
                  onFocus={() => setPhoneFocused(true)}
                  onBlur={() => setPhoneFocused(false)}
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
                <View className="flex-row items-center gap-1.5">
                  <Icon name="alert-circle" size={15} tone="destructive" />
                  <AppText variant="small" tone="error">
                    {error}
                  </AppText>
                </View>
              ) : null}

              <Button
                title={busy === "phone" ? "Sending code…" : "Send code"}
                size="lg"
                fullWidth
                loading={busy === "phone"}
                disabled={busy !== null || !phoneValid}
                onPress={sendCode}
                className="mt-1"
              />
            </View>

            <AppText variant="caption" className="text-center">
              By continuing you agree to Abonten's{" "}
              <AppText
                variant="caption"
                tone="brand"
                className="font-semibold"
                onPress={() => Linking.openURL(TERMS_URL)}
              >
                Terms
              </AppText>{" "}
              and{" "}
              <AppText
                variant="caption"
                tone="brand"
                className="font-semibold"
                onPress={() => Linking.openURL(PRIVACY_URL)}
              >
                Privacy Policy
              </AppText>
              .
            </AppText>
          </View>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}
