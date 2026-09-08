import { api } from "@/lib/api";
import { hapticError } from "@/lib/haptics";
import { isLikelyEmail } from "@abonten/core/emailOtp";
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
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// Email one-time-code sign-in: enter an address, we ask the web API to send
// a 6-digit code (rate-limited + enumeration-safe server-side), then hand
// off to the shared verify screen. The code is verified directly against
// Supabase there, so the session lands in secure-store natively.
export default function EmailSignIn() {
  const router = useRouter();
  const c = useThemeColors();
  const insets = useSafeAreaInsets();

  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);

  const valid = isLikelyEmail(email);

  async function sendCode() {
    if (!valid) {
      hapticError();
      setError("Enter a valid email address.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const res = await api.auth.requestEmailOtp({ email: email.trim() });

      if (res.status !== 200) {
        hapticError();
        setError(res.message ?? "Couldn't send the code. Try again.");
        return;
      }

      router.push({
        pathname: "/(auth)/verify",
        params: { channel: "email", email: email.trim() },
      });
    } catch {
      hapticError();
      setError("Network error. Check your connection and try again.");
    } finally {
      setBusy(false);
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
          <View className="gap-7">
            <View className="items-center gap-3">
              <AbontenLogo size={48} />
              <AbontenWordmark size={20} />
            </View>

            <View className="gap-2">
              <AppText variant="pageTitle" className="text-center">
                Continue with email
              </AppText>
              <AppText variant="muted" className="text-center">
                We'll email you a 6-digit code to sign in.
              </AppText>
            </View>

            <View className="gap-3 rounded-2xl border border-border bg-card p-4">
              <AppText variant="label">Email address</AppText>
              <TextInput
                className={[
                  "h-[52px] rounded-xl border bg-background px-3 text-[16px] text-foreground",
                  error
                    ? "border-destructive"
                    : focused
                      ? "border-ring"
                      : "border-input",
                ].join(" ")}
                placeholder="you@example.com"
                placeholderTextColor={c["muted-foreground"]}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                textContentType="emailAddress"
                spellCheck={false}
                value={email}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                onChangeText={(v) => {
                  setEmail(v);
                  if (error) setError(null);
                }}
                editable={!busy}
                onSubmitEditing={sendCode}
                returnKeyType="send"
              />

              {error ? (
                <View className="flex-row items-center gap-1.5">
                  <Icon name="alert-circle" size={15} tone="destructive" />
                  <AppText variant="small" tone="error">
                    {error}
                  </AppText>
                </View>
              ) : null}

              <Button
                title={busy ? "Sending code…" : "Send code"}
                size="lg"
                fullWidth
                loading={busy}
                disabled={busy || !valid}
                onPress={sendCode}
                className="mt-1"
              />
            </View>
          </View>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}
