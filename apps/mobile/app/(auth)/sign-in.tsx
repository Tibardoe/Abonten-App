import { signInWithGoogle } from "@/auth/googleSignIn";
import { api } from "@/lib/api";
import { useThemeColors } from "@abonten/ui-native/theme";
import { useRouter } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";

const DEFAULT_DIAL_CODE = "+233";

export default function SignIn() {
  const router = useRouter();
  const c = useThemeColors();
  const [rawPhone, setRawPhone] = useState("");
  const [busy, setBusy] = useState<"phone" | "google" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function sendCode() {
    setError(null);
    setBusy("phone");
    try {
      const res = await api.auth.requestPhoneOtp({
        dialCode: DEFAULT_DIAL_CODE,
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
    <View className="flex-1 justify-center gap-6 bg-background px-6">
      <View className="gap-2">
        <Text className="text-3xl font-bold text-foreground">Sign in</Text>
        <Text className="text-sm text-muted-foreground">
          Enter your phone number and we'll text you a code.
        </Text>
      </View>

      <View className="flex-row items-center gap-2">
        <View className="rounded-md border border-border bg-card px-3 py-3">
          <Text className="text-base text-foreground">{DEFAULT_DIAL_CODE}</Text>
        </View>
        <TextInput
          className="flex-1 rounded-md border border-border bg-card px-3 py-3 text-base text-foreground"
          placeholder="24 123 4567"
          placeholderTextColor={c["muted-foreground"]}
          keyboardType="phone-pad"
          autoComplete="tel"
          value={rawPhone}
          onChangeText={setRawPhone}
          editable={busy === null}
        />
      </View>

      {error ? <Text className="text-sm text-destructive">{error}</Text> : null}

      <Pressable
        className="items-center rounded-md bg-primary px-4 py-3 active:opacity-80 disabled:opacity-50"
        disabled={busy !== null || rawPhone.trim().length < 6}
        onPress={sendCode}
      >
        {busy === "phone" ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text className="text-base font-semibold text-primary-foreground">
            Send code
          </Text>
        )}
      </Pressable>

      <View className="flex-row items-center gap-3">
        <View className="h-px flex-1 bg-border" />
        <Text className="text-xs uppercase text-muted-foreground">or</Text>
        <View className="h-px flex-1 bg-border" />
      </View>

      <Pressable
        className="items-center rounded-md border border-border px-4 py-3 active:opacity-80 disabled:opacity-50"
        disabled={busy !== null}
        onPress={google}
      >
        {busy === "google" ? (
          <ActivityIndicator />
        ) : (
          <Text className="text-base font-semibold text-foreground">
            Continue with Google
          </Text>
        )}
      </Pressable>
    </View>
  );
}
