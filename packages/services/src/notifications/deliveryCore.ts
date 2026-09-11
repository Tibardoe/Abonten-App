import { timingSafeEqual } from "node:crypto";
import { logger } from "@abonten/core/logger";
import { getSupabaseServiceClient } from "../supabase/serviceClient";
import { type PushResult, sendPushToUser } from "./sendPushNotification";

// Push + email delivery for notifications written in SQL: the reward
// engine's notices (push + email, migrations 20260911152213 / 20260911163306)
// and the "New review" / "Event cancelled" notices (push only). The
// `notification-delivery` pg_cron job calls POST /api/notifications/deliver
// while anything is due; that route checks the token and runs this. The
// database decides what is due (quiet hours, one email per 12 hours); this
// only sends what it is handed and records the outcome.

export type RewardEmailItem = {
  title: string;
  body: string | null;
  at: string;
};

export type RewardEmail = {
  /** For the signed unsubscribe link. */
  userId: string;
  to: string;
  name: string | null;
  items: RewardEmailItem[];
};

/** How the transport's email send went. `retry` = try again next run. */
export type EmailSendResult =
  | { ok: true }
  | { ok: false; error: string; outcome: "retry" | "skip" };

export type DeliveryDeps = {
  /** Renders and sends one reward email (React email + Resend, in the web app). */
  sendEmail: (email: RewardEmail) => Promise<EmailSendResult>;
  /** Defaults to the Expo push sender. */
  sendPush?: (
    userId: string,
    payload: {
      title: string;
      body?: string | null;
      link?: string | null;
      data?: Record<string, unknown>;
    },
  ) => Promise<PushResult>;
};

export type DeliverySummary = {
  claimed: number;
  pushSent: number;
  emailSent: number;
  skipped: number;
  retrying: number;
  failed: number;
};

type ClaimedRow = {
  delivery_id: number;
  notification_id: string;
  user_id: string;
  channel: string;
  source: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  data: unknown;
  created_at: string;
};

const BATCH = 200;
const PARALLEL = 5;

/** Compares the caller's token with the one the cron job sends. */
export async function isDeliveryTokenValid(
  token: string | null,
): Promise<boolean> {
  if (!token) return false;
  const { data, error } = await getSupabaseServiceClient()
    .from("notification_delivery_config")
    .select("token")
    .eq("id", true)
    .maybeSingle();
  if (error || !data?.token) {
    if (error) logger.error(`delivery token read failed: ${error.message}`);
    return false;
  }
  const expected = Buffer.from(data.token);
  const given = Buffer.from(token);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

const singlePush = (row: ClaimedRow) => ({
  title: row.title,
  body: row.body,
  link: row.link,
  data: (row.data ?? {}) as Record<string, unknown>,
});

/** Several reward notices for one person in a run go out as one push. */
function rewardPushFor(rows: ClaimedRow[]) {
  if (rows.length === 1) return singlePush(rows[0]);
  const summary = rows.map((r) => r.title).join(" · ");
  return {
    title: `${rows.length} Abonten Rewards updates`,
    body: summary.length > 160 ? `${summary.slice(0, 157)}…` : summary,
    link: "/rewards",
    data: { kind: "rewards" },
  };
}

async function inChunks<T>(items: T[], run: (item: T) => Promise<void>) {
  for (let i = 0; i < items.length; i += PARALLEL) {
    await Promise.all(items.slice(i, i + PARALLEL).map(run));
  }
}

export async function deliverQueuedNotificationsCore(
  deps: DeliveryDeps,
): Promise<{ status: 200 | 500; message?: string; data?: DeliverySummary }> {
  const service = getSupabaseServiceClient();
  const sendPush = deps.sendPush ?? sendPushToUser;

  const { data, error } = await service.rpc("notification_delivery_claim", {
    p_limit: BATCH,
  });
  if (error) {
    logger.error(`notification_delivery_claim failed: ${error.message}`);
    return { status: 500, message: "Couldn't claim deliveries" };
  }
  const rows = (data ?? []) as ClaimedRow[];
  const summary: DeliverySummary = {
    claimed: rows.length,
    pushSent: 0,
    emailSent: 0,
    skipped: 0,
    retrying: 0,
    failed: 0,
  };
  if (rows.length === 0) return { status: 200, data: summary };

  const finish = async (
    ids: number[],
    status: "sent" | "skipped" | "failed" | "queued",
    detail?: string,
  ) => {
    const { error: finishError } = await service.rpc(
      "notification_delivery_finish",
      { p_ids: ids, p_status: status, p_detail: detail },
    );
    if (finishError) {
      // The claim expires after 5 minutes and the row is retried.
      logger.error(
        `notification_delivery_finish failed: ${finishError.message}`,
      );
    }
    if (status === "skipped") summary.skipped += ids.length;
    else if (status === "failed") summary.failed += ids.length;
    else if (status === "queued") summary.retrying += ids.length;
  };

  // Reward notices are batched per person; a review or a cancellation is
  // its own push (it opens its own screen).
  const groups = new Map<string, ClaimedRow[]>();
  for (const row of rows) {
    const key =
      row.source === "rewards"
        ? `${row.channel}:${row.user_id}`
        : `${row.channel}:${row.user_id}:${row.delivery_id}`;
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }

  await inChunks([...groups.values()], async (group) => {
    const { channel, user_id: userId } = group[0];
    const ids = group.map((r) => r.delivery_id);
    try {
      if (channel === "push") {
        const result = await sendPush(
          userId,
          group[0].source === "rewards"
            ? rewardPushFor(group)
            : singlePush(group[0]),
        );
        if (result === "sent") {
          await finish(ids, "sent");
          summary.pushSent += 1;
        } else if (result === "no_devices") {
          await finish(ids, "skipped", "no_device");
        } else {
          await finish(ids, "queued", "push_failed");
        }
        return;
      }

      const [authUser, profile] = await Promise.all([
        service.auth.admin.getUserById(userId),
        service
          .from("user_info")
          .select("full_name, username")
          .eq("id", userId)
          .maybeSingle(),
      ]);
      const email = authUser.data.user?.email;
      if (!email) {
        await finish(ids, "skipped", "no_email");
        return;
      }
      const result = await deps.sendEmail({
        userId,
        to: email,
        name: profile.data?.full_name || profile.data?.username || null,
        items: group
          .slice()
          .sort((a, b) => a.created_at.localeCompare(b.created_at))
          .map((r) => ({ title: r.title, body: r.body, at: r.created_at })),
      });
      if (result.ok) {
        await finish(ids, "sent");
        summary.emailSent += 1;
      } else {
        await finish(
          ids,
          result.outcome === "retry" ? "queued" : "skipped",
          result.error,
        );
      }
    } catch (e) {
      logger.error(`notification delivery (${channel}) failed: ${e}`);
      await finish(ids, "queued", "unexpected_error");
    }
  });

  return { status: 200, data: summary };
}
