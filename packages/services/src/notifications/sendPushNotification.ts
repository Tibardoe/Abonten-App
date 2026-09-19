import {
  HTTP_TIMEOUTS,
  fetchWithTimeout,
} from "@abonten/core/http/fetchWithTimeout";
import { logger } from "@abonten/core/logger";
import { getSupabaseServiceClient } from "@abonten/services/supabase/serviceClient";
import { recordPushTickets } from "./pushReceiptsCore";
import { sendWebPushToUser } from "./webPushCore";

// Fire a push to every device the target user has registered: the app's
// Expo tokens and any browser that turned on web push (webPushCore).
// Best-effort: the caller (createNotification, the delivery queue) never
// lets a push failure affect the in-app notification write. Expo is called
// directly (a plain fetch — no SDK, no secret; Expo push tokens are the only
// credential and they are per-device and owner-supplied). Accepted tickets
// are recorded so their receipts are read later (pushReceiptsCore).

const EXPO_PUSH_ENDPOINT = "https://exp.host/--/api/v2/push/send";

type PushPayload = {
  title: string;
  body?: string | null;
  link?: string | null;
  /** Structured target (kind + entity ids) for native tap routing. */
  data?: Record<string, unknown>;
};

/** What happened: at least one device accepted it, none registered, or it failed. */
export type PushResult = "sent" | "no_devices" | "failed";

export async function sendPushToUser(
  userId: string,
  payload: PushPayload,
): Promise<PushResult> {
  const [app, web] = await Promise.all([
    sendExpoPushToUser(userId, payload),
    sendWebPushToUser(userId, payload).catch((err): PushResult => {
      logger.error(`Web push: send failed: ${err}`);
      return "failed";
    }),
  ]);
  if (app === "sent" || web === "sent") return "sent";
  if (app === "no_devices" && web === "no_devices") return "no_devices";
  return "failed";
}

async function sendExpoPushToUser(
  userId: string,
  payload: PushPayload,
): Promise<PushResult> {
  const supabase = getSupabaseServiceClient();

  const { data: tokens, error } = await supabase
    .from("device_token")
    .select("token")
    .eq("user_id", userId);

  if (error) {
    logger.error(`Push: failed reading device tokens: ${error.message}`);
    return "failed";
  }
  if (!tokens || tokens.length === 0) return "no_devices";

  const messages = tokens.map((row: { token: string }) => ({
    to: row.token,
    title: payload.title,
    body: payload.body ?? undefined,
    sound: "default" as const,
    data: {
      ...(payload.link ? { link: payload.link } : {}),
      ...(payload.data ?? {}),
    },
  }));

  try {
    const res = await fetchWithTimeout(EXPO_PUSH_ENDPOINT, {
      timeoutMs: HTTP_TIMEOUTS.expoPush,
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(messages),
    });

    if (!res.ok) {
      logger.error(`Push: Expo responded ${res.status}`);
      return "failed";
    }

    // Expo returns a per-message ticket; a `DeviceNotRegistered` error means
    // the token is dead and should be pruned so it isn't retried forever.
    const json = (await res.json()) as {
      data?: { status: string; id?: string; details?: { error?: string } }[];
    };
    const dead: string[] = [];
    const accepted: { ticketId: string; token: string }[] = [];
    json.data?.forEach((ticket, i) => {
      if (ticket.status === "ok" && ticket.id && messages[i]) {
        accepted.push({ ticketId: ticket.id, token: messages[i].to });
      }
      if (
        ticket.status === "error" &&
        ticket.details?.error === "DeviceNotRegistered"
      ) {
        const token = messages[i]?.to;
        if (token) dead.push(token);
      }
    });

    if (dead.length > 0) {
      await supabase.from("device_token").delete().in("token", dead);
    }
    await recordPushTickets(accepted, supabase);
    if (json.data?.some((ticket) => ticket.status === "ok")) return "sent";
    return dead.length === messages.length ? "no_devices" : "failed";
  } catch (err) {
    logger.error(`Push: send failed: ${err}`);
    return "failed";
  }
}
