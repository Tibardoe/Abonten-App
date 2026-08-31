import { api } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";

export default function Verify() {
  const router = useRouter();
  const { phoneE164 } = useLocalSearchParams<{ phoneE164: string }>();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function verify() {
    if (!phoneE164) {
      setError("Missing phone number — go back and try again.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const res = await api.auth.verifyPhoneOtp({
        phoneE164,
        code: code.trim(),
      });

      if (res.status !== 200 || !res.data) {
        setError(res.message ?? "That code didn't work. Try again.");
        return;
      }

      // Persist the returned session — SessionProvider's onAuthStateChange
      // then routes into the app.
      const { error: setErr } = await supabase.auth.setSession({
        access_token: res.data.access_token,
        refresh_token: res.data.refresh_token,
      });

      if (setErr) {
        setError("Signed in, but the session couldn't be saved. Try again.");
      }
    } catch {
      setError("Network error. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View className="flex-1 justify-center gap-6 bg-background px-6">
      <View className="gap-2">
        <Text className="text-3xl font-bold text-foreground">Enter code</Text>
        <Text className="text-sm text-muted-foreground">
          Sent to {phoneE164 ?? "your phone"}.
        </Text>
      </View>

      <TextInput
        className="rounded-md border border-border bg-card px-3 py-3 text-center text-2xl tracking-[8px] text-foreground"
        placeholder="000000"
        placeholderTextColor="#9CA3AF"
        keyboardType="number-pad"
        autoComplete="sms-otp"
        maxLength={6}
        value={code}
        onChangeText={setCode}
        editable={!busy}
      />

      {error ? <Text className="text-sm text-destructive">{error}</Text> : null}

      <Pressable
        className="items-center rounded-md bg-primary px-4 py-3 active:opacity-80 disabled:opacity-50"
        disabled={busy || code.trim().length < 6}
        onPress={verify}
      >
        {busy ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text className="text-base font-semibold text-primary-foreground">
            Verify
          </Text>
        )}
      </Pressable>

      <Pressable onPress={() => router.back()} disabled={busy}>
        <Text className="text-center text-sm text-muted-foreground">
          Use a different number
        </Text>
      </Pressable>
    </View>
  );
}
