import { logger } from "@abonten/core/logger";
import { getSupabaseServiceClient } from "@abonten/services/supabase/serviceClient";

// Fire a push to every device the target user has registered. Best-effort:
// the caller (createNotification) never lets a push failure affect the
// in-app notification write. Uses the Expo push service directly (a plain
// fetch — no SDK, no secret; Expo push tokens are the only credential and
// they are per-device and owner-supplied).

const EXPO_PUSH_ENDPOINT = "https://exp.host/--/api/v2/push/send";

type PushPayload = {
  title: string;
  body?: string | null;
  link?: string | null;
};

export async function sendPushToUser(
  userId: string,
  payload: PushPayload,
): Promise<void> {
  const supabase = getSupabaseServiceClient();

  const { data: tokens, error } = await supabase
    .from("device_token")
    .select("token")
    .eq("user_id", userId);

  if (error) {
    logger.error(`Push: failed reading device tokens: ${error.message}`);
    return;
  }
  if (!tokens || tokens.length === 0) return;

  const messages = tokens.map((row: { token: string }) => ({
    to: row.token,
    title: payload.title,
    body: payload.body ?? undefined,
    sound: "default" as const,
    data: payload.link ? { link: payload.link } : {},
  }));

  try {
    const res = await fetch(EXPO_PUSH_ENDPOINT, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(messages),
    });

    if (!res.ok) {
      logger.error(`Push: Expo responded ${res.status}`);
      return;
    }

    // Expo returns a per-message ticket; a `DeviceNotRegistered` error means
    // the token is dead and should be pruned so it isn't retried forever.
    const json = (await res.json()) as {
      data?: { status: string; details?: { error?: string } }[];
    };
    const dead: string[] = [];
    json.data?.forEach((ticket, i) => {
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
  } catch (err) {
    logger.error(`Push: send failed: ${err}`);
  }
}
