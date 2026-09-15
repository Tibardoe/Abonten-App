"use client";

import { getWebPushConfig } from "@/actions/webPush/getWebPushConfig";
import { getWebPushStatus } from "@/actions/webPush/getWebPushStatus";
import { registerWebPushSubscription } from "@/actions/webPush/registerWebPushSubscription";
import { unregisterWebPushSubscription } from "@/actions/webPush/unregisterWebPushSubscription";
import { useCallback, useEffect, useState } from "react";

// Browser push for Settings › Notifications. Registers /push-sw.js only when
// someone switches it on (never on page load), asks the browser for
// permission from that click, and saves the subscription with the server.
//
// States the UI explains:
//   unsupported     no Push API (older browsers; iPhone/iPad Safari unless
//                   the site was added to the Home Screen)
//   unavailable     web push isn't configured on this deployment
//   denied          notifications blocked for this site in the browser
//   off / on        the switch

export type WebPushState =
  | "loading"
  | "unsupported"
  | "unavailable"
  | "denied"
  | "off"
  | "on";

const SW_URL = "/push-sw.js";

function supported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/** True on iPhone/iPad Safari outside a Home Screen web app. */
export function needsHomeScreenInstall(): boolean {
  if (typeof window === "undefined") return false;
  const ios =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const standalone = window.matchMedia?.("(display-mode: standalone)").matches;
  return ios && !standalone;
}

function toUint8Array(base64Url: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

async function currentSubscription(): Promise<PushSubscription | null> {
  const registration = await navigator.serviceWorker.getRegistration(SW_URL);
  return registration ? registration.pushManager.getSubscription() : null;
}

/**
 * Before signing out: stop pushes for this person on this browser, so the
 * next person to use it never sees their notices. Never throws, and gives up
 * after two seconds so sign-out is never held up.
 */
export async function releaseWebPushOnSignOut(): Promise<void> {
  if (!supported()) return;
  const release = (async () => {
    const sub = await currentSubscription();
    if (!sub) return;
    await unregisterWebPushSubscription({ endpoint: sub.endpoint });
    await sub.unsubscribe();
  })().catch(() => {});
  await Promise.race([
    release,
    new Promise((resolve) => setTimeout(resolve, 2000)),
  ]);
}

export function useWebPush() {
  const [state, setState] = useState<WebPushState>("loading");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!supported()) {
        if (!cancelled) setState("unsupported");
        return;
      }
      const { publicKey } = await getWebPushConfig();
      if (!publicKey) {
        if (!cancelled) setState("unavailable");
        return;
      }
      if (Notification.permission === "denied") {
        if (!cancelled) setState("denied");
        return;
      }
      const sub = await currentSubscription();
      if (!sub) {
        if (!cancelled) setState("off");
        return;
      }
      // The subscription in this browser may belong to another account that
      // signed in here before; only "on" if it is this person's.
      const res = await getWebPushStatus({ endpoint: sub.endpoint });
      if (!cancelled) {
        setState(res.status === 200 && res.data?.subscribed ? "on" : "off");
      }
    })().catch(() => {
      if (!cancelled) setState("unsupported");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const enable = useCallback(async () => {
    setError(null);
    setPending(true);
    try {
      const { publicKey } = await getWebPushConfig();
      if (!publicKey) {
        setState("unavailable");
        return;
      }
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "off");
        return;
      }
      const registration = await navigator.serviceWorker.register(SW_URL, {
        scope: "/",
      });
      await navigator.serviceWorker.ready;
      const sub =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: toUint8Array(publicKey),
        }));
      const json = sub.toJSON();
      const res = await registerWebPushSubscription({
        endpoint: json.endpoint,
        keys: json.keys,
        userAgent: navigator.userAgent,
      });
      if (res.status === 200) {
        setState("on");
      } else {
        setError(res.message ?? "Couldn't turn on browser notifications.");
      }
    } catch {
      setError("Couldn't turn on browser notifications in this browser.");
    } finally {
      setPending(false);
    }
  }, []);

  const disable = useCallback(async () => {
    setError(null);
    setPending(true);
    try {
      const sub = await currentSubscription();
      if (sub) {
        await unregisterWebPushSubscription({ endpoint: sub.endpoint });
        await sub.unsubscribe();
      }
      setState("off");
    } catch {
      setError("Couldn't turn off browser notifications.");
    } finally {
      setPending(false);
    }
  }, []);

  return { state, pending, error, enable, disable };
}
