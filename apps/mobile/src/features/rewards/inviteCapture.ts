import { api } from "@/lib/api";
import {
  INVITE_WINDOW_DAYS,
  type InviteSource,
  codeFromInstallReferrer,
  isFinalBindResult,
} from "@abonten/core/rewards/invite";
import { normalizeReferralCode } from "@abonten/core/rewards/referralCode";
import type { ReferralBindOutcome } from "@abonten/types/rewards";
import { requireOptionalNativeModule } from "expo-modules-core";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

// A friend's invite this device holds until the person is signed in: from
// an abontenhub.com/invite/CODE link, a code typed on the sign-in screen, or
// (Android) the Play Store install referrer. useInviteBinding sends it to
// the server once there's a session; the server decides.

const KEY = "abonten.pendingInvite";
const INSTALL_REFERRER_CHECKED = "abonten.installReferrerChecked";
const DAY_MS = 86_400_000;

export type PendingInvite = { code: string; at: number; source: InviteSource };

export async function readPendingInvite(): Promise<PendingInvite | null> {
  try {
    const raw = await SecureStore.getItemAsync(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PendingInvite>;
    const code = normalizeReferralCode(parsed.code ?? null);
    if (!code || typeof parsed.at !== "number") return null;
    if (parsed.at < Date.now() - INVITE_WINDOW_DAYS * DAY_MS) return null;
    return {
      code,
      at: parsed.at,
      source:
        parsed.source === "typed" || parsed.source === "install_referrer"
          ? parsed.source
          : "link",
    };
  } catch {
    return null;
  }
}

/**
 * Remembers an invite. A newer link or a typed code replaces an older one
 * (the server only ever binds the first invite that succeeds).
 */
export async function captureInvite(
  rawCode: string | null,
  source: InviteSource,
): Promise<string | null> {
  const code = normalizeReferralCode(rawCode);
  if (!code) return null;
  try {
    await SecureStore.setItemAsync(
      KEY,
      JSON.stringify({ code, at: Date.now(), source }),
    );
  } catch {
    // storage unavailable -- a typed code still works after sign-in
  }
  return code;
}

export async function clearPendingInvite(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(KEY);
  } catch {
    // nothing to clear
  }
}

/**
 * First launch after installing from a Play Store invite link
 * (…&referrer=ref%3DCODE): Google Play hands the referrer to the app once.
 * Checked once per install; never throws.
 */
export async function captureInstallReferrer(): Promise<void> {
  if (Platform.OS !== "android") return;
  // Only when the native module is in this build (it is in current builds;
  // the guard keeps an older binary from crashing on the import).
  if (!requireOptionalNativeModule("ExpoApplication")) return;
  try {
    if (await SecureStore.getItemAsync(INSTALL_REFERRER_CHECKED)) return;
    await SecureStore.setItemAsync(INSTALL_REFERRER_CHECKED, "1");
    const Application = await import("expo-application");
    const referrer = await Application.getInstallReferrerAsync();
    const code = codeFromInstallReferrer(referrer);
    if (!code) return;
    await captureInvite(code, "install_referrer");
    api.rewards.touch({ code, source: "install_referrer" }).catch(() => {});
  } catch {
    // no Play Store (emulator / sideloaded build) or no referrer
  }
}

let inflight: Promise<ReferralBindOutcome | null> | null = null;

/**
 * Sends the held invite to the server (signed-in only). Concurrent callers
 * share one request; a final answer clears the held invite so it's only
 * tried once. Null when there's nothing to bind or the request failed.
 */
export function bindPendingInvite(): Promise<ReferralBindOutcome | null> {
  if (!inflight) {
    inflight = (async () => {
      const pending = await readPendingInvite();
      if (!pending) return null;
      try {
        const res = await api.rewards.bindReferral({
          code: pending.code,
          source: pending.source,
        });
        const outcome = res.data ?? null;
        if (outcome && isFinalBindResult(outcome.result)) {
          await clearPendingInvite();
        }
        return outcome;
      } catch {
        return null;
      }
    })().finally(() => {
      inflight = null;
    });
  }
  return inflight;
}
