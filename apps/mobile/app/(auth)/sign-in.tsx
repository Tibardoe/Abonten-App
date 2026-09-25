import { CountryCodeField } from "@/auth/CountryCodeField";
import { GoogleIcon } from "@/auth/GoogleIcon";
import { signInWithGoogle } from "@/auth/googleSignIn";
import { InviteCodeField } from "@/features/rewards/InviteCodeField";
import { api } from "@/lib/api";
import { hapticError } from "@/lib/haptics";
import { LEGAL_URLS, openExternalLink } from "@/lib/legalLinks";
import { type Country, countryForCode } from "@abonten/core/countries";
import {
  AbontenLogo,
  AbontenWordmark,
  AppText,
  Button,
  Icon,
  KeyboardAwareScrollView,
  KeyboardRevealGroup,
  useToast,
} from "@abonten/ui-native";
import { useThemeColors } from "@abonten/ui-native/theme";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// Shown only for the moment before the market context answers (the server
// always names a market: the visitor's, else the default one).
const FALLBACK_COUNTRY = countryForCode("GH") as Country;

/**
 * The phone country to pre-select and the ones to list first, from the
 * market context (open markets, the request's country). Works signed out.
 */
function useSignInCountry(): { country: Country; priority: string[] } {
  const { data } = useQuery({
    queryKey: ["mobile", "markets", "context", "sign-in"],
    queryFn: async () => {
      const res = await api.markets.context({
        platform: Platform.OS === "android" ? "android" : "ios",
      });
      if (res.status !== 200 || !res.data) throw new Error("unavailable");
      return res.data;
    },
    staleTime: 60 * 60 * 1000,
  });
  return useMemo(() => {
    const open = (data?.markets ?? []).map((m) => m.countryCode);
    const viewer = data?.context.viewerCountry ?? null;
    const preferred =
      (viewer && open.includes(viewer) ? viewer : null) ??
      data?.context.marketCountry ??
      null;
    return {
      country: countryForCode(preferred) ?? FALLBACK_COUNTRY,
      priority: viewer && !open.includes(viewer) ? [...open, viewer] : open,
    };
  }, [data]);
}

export default function SignIn() {
  const router = useRouter();
  const toast = useToast();
  const c = useThemeColors();
  const insets = useSafeAreaInsets();
  const signInMarkets = useSignInCountry();
  const [picked, setPicked] = useState<Country | null>(null);
  // Until the person picks one: the country they are in when Abonten is
  // open there, else the default market's.
  const country = picked ?? signInMarkets.country;
  const setCountry = setPicked;
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
          codeLength: String(res.data.codeLength),
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
      // A Google failure is reported as a toast — `error` belongs to the
      // phone field and would outline it red for a problem it didn't have.
      if (!res.ok && !res.cancelled) {
        hapticError();
        toast.error("Couldn't sign in with Google", {
          description: res.message,
        });
      }
      // On success SessionProvider's onAuthStateChange routes into the app.
    } finally {
      setBusy(null);
    }
  }

  return (
    <View className="flex-1 bg-background">
      <View className="flex-1">
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

        <KeyboardAwareScrollView
          contentContainerStyle={{
            flexGrow: 1,
            justifyContent: "center",
            paddingHorizontal: 24,
            paddingTop: insets.top + 56,
          }}
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
                Continue with Google, your email address, or your phone number.
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

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Continue with email"
              disabled={busy !== null}
              onPress={() => router.push("/(auth)/email")}
              className="h-14 flex-row items-center justify-center gap-3 rounded-xl border border-border bg-card active:opacity-80 disabled:opacity-50"
            >
              <Icon name="mail-outline" size={20} tone="foreground" />
              <AppText variant="bodyStrong">Continue with email</AppText>
            </Pressable>

            <View className="flex-row items-center gap-3">
              <View className="h-px flex-1 bg-border" />
              <AppText variant="overline">or</AppText>
              <View className="h-px flex-1 bg-border" />
            </View>

            <KeyboardRevealGroup className="gap-3 rounded-2xl border border-border bg-card p-4">
              <AppText variant="label">Phone number</AppText>
              <View className="flex-row gap-2">
                <CountryCodeField
                  value={country}
                  onChange={setCountry}
                  priority={signInMarkets.priority}
                />
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
            </KeyboardRevealGroup>

            <InviteCodeField />

            <AppText variant="caption" className="text-center">
              By continuing you agree to Abonten's{" "}
              <AppText
                variant="caption"
                tone="brand"
                className="font-semibold"
                onPress={() => void openExternalLink(LEGAL_URLS.terms)}
              >
                Terms
              </AppText>{" "}
              and{" "}
              <AppText
                variant="caption"
                tone="brand"
                className="font-semibold"
                onPress={() => void openExternalLink(LEGAL_URLS.privacy)}
              >
                Privacy Policy
              </AppText>
              .
            </AppText>
          </View>
        </KeyboardAwareScrollView>
      </View>
    </View>
  );
}
