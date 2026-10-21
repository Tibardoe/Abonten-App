import type { SafetyLocationBody } from "@abonten/api-client";
import { deviceSmsUrl, mapsPinUrl, telUrl } from "@abonten/core/safety/links";
import { translatorFor } from "@abonten/ui-native/i18n";
import { Linking, Platform, Share } from "react-native";

// The path that works without the internet: the phone's own Messages app,
// addressed to the trusted contacts, with where the person is as a map pin
// anyone can open. Cellular texts often get through where data does not.

export function deviceSosText(location: SafetyLocationBody | null): string {
  const t = translatorFor("safety");
  return location
    ? t("deviceSms.withLocation", {
        link: mapsPinUrl(location.lat, location.lng),
      })
    : t("deviceSms.withoutLocation");
}

async function shareText(body: string): Promise<boolean> {
  try {
    const result = await Share.share({ message: body });
    return result.action !== Share.dismissedAction;
  } catch {
    return false;
  }
}

/**
 * Opens Messages addressed to `phones` with `body` written; with no numbers,
 * or when Messages cannot be opened, the share sheet (WhatsApp, Telegram…).
 * True when something opened.
 */
export async function openDeviceSms(
  phones: string[],
  body: string,
): Promise<boolean> {
  if (phones.length === 0) return shareText(body);
  const url = deviceSmsUrl(
    Platform.OS === "ios" ? "ios" : "android",
    phones,
    body,
  );
  try {
    await Linking.openURL(url);
    return true;
  } catch {
    return shareText(body);
  }
}

export function callNumber(number: string): void {
  Linking.openURL(telUrl(number)).catch(() => {});
}
