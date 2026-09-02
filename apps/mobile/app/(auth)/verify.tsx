import { api } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import {
  AbontenLogo,
  AbontenWordmark,
  AppText,
  Button,
  Icon,
} from "@abonten/ui-native";
import { useThemeColors } from "@abonten/ui-native/theme";
import { useLocalSearchParams, useRouter } from "expo-router";
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

export default function Verify() {
  const router = useRouter();
  const c = useThemeColors();
  const insets = useSafeAreaInsets();
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
          contentContainerClassName="grow justify-center gap-7 px-6 pb-10 pt-6"
          keyboardShouldPersistTaps="handled"
        >
          <View className="items-center gap-3">
            <AbontenLogo size={52} />
            <AbontenWordmark size={22} />
          </View>

          <View className="gap-1.5">
            <AppText className="text-center text-[24px] font-bold text-foreground">
              Enter your code
            </AppText>
            <AppText className="text-center text-[14px] text-muted-foreground">
              We sent a 6-digit code to {phoneE164 ?? "your phone"}.
            </AppText>
          </View>

          <TextInput
            className="rounded-lg border border-input bg-background px-3 py-3.5 text-center text-2xl tracking-[8px] text-foreground"
            placeholder="000000"
            placeholderTextColor={c["muted-foreground"]}
            keyboardType="number-pad"
            autoComplete="sms-otp"
            maxLength={6}
            value={code}
            onChangeText={(v) => {
              setCode(v);
              if (error) setError(null);
            }}
            editable={!busy}
            onSubmitEditing={verify}
            returnKeyType="done"
          />

          {error ? (
            <AppText className="text-[13px] text-destructive">{error}</AppText>
          ) : null}

          <Button
            title={busy ? "Verifying…" : "Verify"}
            fullWidth
            loading={busy}
            disabled={busy || code.trim().length < 6}
            onPress={verify}
          />

          <Pressable onPress={() => router.back()} disabled={busy}>
            <AppText className="text-center text-[13px] text-muted-foreground">
              Use a different number
            </AppText>
          </Pressable>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}
