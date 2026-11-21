import { api } from "@/lib/api";
import {
  canReadInstallReferrer,
  firstTimeOnThisInstall,
  getInstallReferrer,
} from "@/lib/installReferrer";
import {
  INVITE_WINDOW_DAYS,
  type InviteSource,
  codeFromInstallReferrer,
  isFinalBindResult,
} from "@abonten/core/rewards/invite";
import { normalizeReferralCode } from "@abonten/core/rewards/referralCode";
import type { ReferralBindOutcome } from "@abonten/types/rewards";
import * as SecureStore from "expo-secure-store";

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

let referrerCapture: Promise<void> | null = null;

/**
 * First launch after installing from a Play Store invite link
 * (…&referrer=ref%3DCODE): Google Play hands the referrer to the app.
 * Checked once per install; callers in one run share the one check, so a
 * second caller waits for the invite to be held instead of finding the
 * check already marked done. Never throws. (A listing's "Get the app"
 * reads the same referrer for its own part: useInstallListingOpen.)
 */
export function captureInstallReferrer(): Promise<void> {
  if (!referrerCapture) {
    referrerCapture = (async () => {
      if (!canReadInstallReferrer()) return;
      if (!(await firstTimeOnThisInstall(INSTALL_REFERRER_CHECKED))) return;
      const code = codeFromInstallReferrer(await getInstallReferrer());
      if (!code) return;
      await captureInvite(code, "install_referrer");
      api.rewards.touch({ code, source: "install_referrer" }).catch(() => {});
    })().catch(() => {
      // no Play Store (emulator / sideloaded build) or no referrer
    });
  }
  return referrerCapture;
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
