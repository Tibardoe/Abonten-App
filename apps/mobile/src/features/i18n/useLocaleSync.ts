import { useSession } from "@/auth/SessionProvider";
import { api } from "@/lib/api";
import { useLocale } from "@abonten/ui-native/i18n";
import * as SecureStore from "expo-secure-store";
import { useEffect } from "react";

// Saves the app's language to the signed-in account (user_info.locale), so
// what Abonten sends this person — push notifications, emails, the notices
// in their inbox — is written in the language they read the app in.
//
// The choice itself lives on the device (Settings → Language works signed
// out). This only mirrors it: once after sign-in and again whenever the
// language changes. The last value sent is remembered per account, so a
// launch with nothing new makes no request; a failed save is simply tried
// again on the next launch.

const SYNCED_KEY = "abonten.locale.synced";

export function useLocaleSync(): void {
  const { session } = useSession();
  const userId = session?.user.id ?? null;
  const { locale } = useLocale();

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    const marker = `${userId}:${locale}`;
    (async () => {
      try {
        const synced = await SecureStore.getItemAsync(SYNCED_KEY);
        if (cancelled || synced === marker) return;
        const res = await api.account.updateLocalePreferences({ locale });
        if (cancelled || res.status !== 200) return;
        await SecureStore.setItemAsync(SYNCED_KEY, marker);
      } catch {
        // Offline or signed out mid-request: the next launch tries again.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, locale]);
}
