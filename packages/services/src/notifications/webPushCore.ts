import { logger } from "@abonten/core/logger";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import webpush from "web-push";
import { getSupabaseServiceClient } from "../supabase/serviceClient";

// Web push (the browser Push API) for signed-in web users. The web app's
// service worker (apps/web/public/push-sw.js) subscribes with our VAPID
// public key; the browser gives back an endpoint on its vendor's push
// service plus two keys, which the web Server Actions hand to
// registerWebPushSubscriptionCore after checking the session. sendPushToUser
// sends to these alongside the app's Expo tokens, so every notice that
// pushes to the app now also reaches browsers that asked for it.
//
// Keys live in the web deployment's environment: WEB_PUSH_VAPID_PUBLIC_KEY,
// WEB_PUSH_VAPID_PRIVATE_KEY and WEB_PUSH_SUBJECT (a mailto: or https: URL
// push services can contact). Until all three are set web push is simply
// unavailable: the settings switch is hidden and nothing is sent.
//
// Only endpoints on a known push service are stored. The sender POSTs to the
// endpoint, so accepting any URL would let a signed-in user make the server
// call an address of their choosing.

const MAX_PER_USER = 10;
const TTL_SECONDS = 24 * 60 * 60;

const PUSH_SERVICE_HOSTS = [
  /^fcm\.googleapis\.com$/, // Chrome, Edge (Chromium), Opera, Samsung Internet
  /^android\.googleapis\.com$/,
  /^updates\.push\.services\.mozilla\.com$/, // Firefox
  /(^|\.)push\.services\.mozilla\.com$/,
  /(^|\.)push\.apple\.com$/, // Safari (web.push.apple.com)
  /(^|\.)notify\.windows\.com$/, // Legacy Edge / Windows
];

export type WebPushConfig = { publicKey: string | null };

type Envelope<T = undefined> = {
  status: 200 | 400 | 401 | 500 | 503;
  message?: string;
  data?: T;
};

type Vapid = { publicKey: string; privateKey: string; subject: string };

function readVapid(): Vapid | null {
  const publicKey = process.env.WEB_PUSH_VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.WEB_PUSH_VAPID_PRIVATE_KEY?.trim();
  const subject = process.env.WEB_PUSH_SUBJECT?.trim();
  if (!publicKey || !privateKey || !subject) return null;
  return { publicKey, privateKey, subject };
}

/** The key browsers subscribe with, or null while web push isn't configured. */
export function getWebPushConfig(): WebPushConfig {
  return { publicKey: readVapid()?.publicKey ?? null };
}

export function isAllowedPushEndpoint(endpoint: string): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.username || url.password) return false;
  if (url.port && url.port !== "443") return false;
  return PUSH_SERVICE_HOSTS.some((re) => re.test(url.hostname));
}

const BASE64URL = /^[A-Za-z0-9_-]+={0,2}$/;

export type WebPushSubscriptionInput = {
  endpoint?: unknown;
  keys?: { p256dh?: unknown; auth?: unknown } | null;
  userAgent?: unknown;
};

function parseSubscription(input: WebPushSubscriptionInput) {
  const endpoint =
    typeof input.endpoint === "string" ? input.endpoint.trim() : "";
  const p256dh =
    typeof input.keys?.p256dh === "string" ? input.keys.p256dh.trim() : "";
  const auth =
    typeof input.keys?.auth === "string" ? input.keys.auth.trim() : "";
  if (
    !endpoint ||
    endpoint.length > 1024 ||
    !isAllowedPushEndpoint(endpoint) ||
    p256dh.length < 16 ||
    p256dh.length > 200 ||
    !BASE64URL.test(p256dh) ||
    auth.length < 8 ||
    auth.length > 100 ||
    !BASE64URL.test(auth)
  ) {
    return null;
  }
  const userAgent =
    typeof input.userAgent === "string" ? input.userAgent.slice(0, 300) : null;
  return { endpoint, p256dh, auth, userAgent };
}

export async function registerWebPushSubscriptionCore(
  userId: string,
  input: WebPushSubscriptionInput,
  service: ServiceRoleClient = getSupabaseServiceClient(),
): Promise<Envelope> {
  if (!userId) return { status: 401, message: "User not logged in" };
  if (!readVapid()) {
    return { status: 503, message: "Browser notifications aren't available." };
  }
  const sub = parseSubscription(input ?? {});
  if (!sub) {
    return { status: 400, message: "This browser's subscription isn't valid." };
  }

  // Upsert on the unique endpoint: a browser re-subscribes on every visit to
  // settings, and a browser that changed accounts moves to the new one.
  const { error } = await service.from("web_push_subscription").upsert(
    {
      user_id: userId,
      endpoint: sub.endpoint,
      p256dh: sub.p256dh,
      auth: sub.auth,
      user_agent: sub.userAgent,
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: "endpoint" },
  );
  if (error) {
    logger.error(`web_push_subscription upsert failed: ${error.message}`);
    return { status: 500, message: "Something went wrong!" };
  }

  // Keep the most recent few browsers per person.
  const { data: extra } = await service
    .from("web_push_subscription")
    .select("id")
    .eq("user_id", userId)
    .order("last_seen_at", { ascending: false })
    .range(MAX_PER_USER, MAX_PER_USER + 50);
  if (extra && extra.length > 0) {
    await service
      .from("web_push_subscription")
      .delete()
      .in(
        "id",
        extra.map((r) => r.id),
      );
  }

  return { status: 200, message: "Browser notifications are on." };
}

export async function unregisterWebPushSubscriptionCore(
  userId: string,
  input: { endpoint?: unknown },
  service: ServiceRoleClient = getSupabaseServiceClient(),
): Promise<Envelope> {
  if (!userId) return { status: 401, message: "User not logged in" };
  const endpoint = typeof input?.endpoint === "string" ? input.endpoint : "";
  if (!endpoint) return { status: 400, message: "A subscription is required" };
  const { error } = await service
    .from("web_push_subscription")
    .delete()
    .eq("endpoint", endpoint)
    .eq("user_id", userId);
  if (error) {
    logger.error(`web_push_subscription delete failed: ${error.message}`);
    return { status: 500, message: "Something went wrong!" };
  }
  return { status: 200, message: "Browser notifications are off." };
}

/** Whether this browser's endpoint is registered to this person. */
export async function getWebPushStatusCore(
  userId: string,
  input: { endpoint?: unknown },
  service: ServiceRoleClient = getSupabaseServiceClient(),
): Promise<Envelope<{ subscribed: boolean }>> {
  if (!userId) return { status: 401, message: "User not logged in" };
  const endpoint = typeof input?.endpoint === "string" ? input.endpoint : "";
  if (!endpoint) return { status: 200, data: { subscribed: false } };
  const { data, error } = await service
    .from("web_push_subscription")
    .select("id")
    .eq("endpoint", endpoint)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    logger.error(`web_push_subscription read failed: ${error.message}`);
    return { status: 500, message: "Something went wrong!" };
  }
  return { status: 200, data: { subscribed: !!data } };
}

export type WebPushPayload = {
  title: string;
  body?: string | null;
  link?: string | null;
  data?: Record<string, unknown>;
};

type SendNotification = typeof webpush.sendNotification;

/**
 * Sends one notice to every browser the person subscribed. "no_devices" when
 * web push is unconfigured or they have none. Dead subscriptions (404/410
 * from the push service) are deleted.
 */
export async function sendWebPushToUser(
  userId: string,
  payload: WebPushPayload,
  options: {
    service?: ServiceRoleClient;
    sendNotification?: SendNotification;
  } = {},
): Promise<"sent" | "no_devices" | "failed"> {
  const vapid = readVapid();
  if (!vapid) return "no_devices";
  const service = options.service ?? getSupabaseServiceClient();
  const send = options.sendNotification ?? webpush.sendNotification;

  const { data: subs, error } = await service
    .from("web_push_subscription")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", userId);
  if (error) {
    logger.error(`Web push: failed reading subscriptions: ${error.message}`);
    return "failed";
  }
  if (!subs || subs.length === 0) return "no_devices";

  // The service worker opens `link` on click and passes notificationId so
  // the in-app row is marked read. Kept small: push services cap payloads
  // at about 4 KB.
  const body = JSON.stringify({
    title: payload.title.slice(0, 120),
    body: payload.body ? payload.body.slice(0, 240) : undefined,
    link: payload.link ?? undefined,
    notificationId:
      typeof payload.data?.notificationId === "string"
        ? payload.data.notificationId
        : undefined,
  });

  const dead: string[] = [];
  const delivered: string[] = [];
  let failed = 0;
  await Promise.all(
    subs.map(async (sub) => {
      if (!isAllowedPushEndpoint(sub.endpoint)) {
        dead.push(sub.id);
        return;
      }
      try {
        await send(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          body,
          {
            TTL: TTL_SECONDS,
            urgency: "normal",
            timeout: 10_000,
            vapidDetails: vapid,
          },
        );
        delivered.push(sub.id);
      } catch (e) {
        const statusCode = (e as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          dead.push(sub.id);
        } else {
          failed += 1;
          logger.error(
            `Web push: send failed (${statusCode ?? "network"}): ${(e as Error).message}`,
          );
        }
      }
    }),
  );

  if (dead.length > 0) {
    await service.from("web_push_subscription").delete().in("id", dead);
  }
  if (delivered.length > 0) {
    await service
      .from("web_push_subscription")
      .update({ last_success_at: new Date().toISOString() })
      .in("id", delivered);
    return "sent";
  }
  return failed > 0 ? "failed" : "no_devices";
}
