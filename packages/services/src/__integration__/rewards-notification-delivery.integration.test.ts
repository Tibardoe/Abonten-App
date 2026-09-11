import type { Database } from "@abonten/types/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";
// Requires a local Supabase stack (npm run test:db:up at the repo root).
// Push + email delivery for reward notices (migration 20260911152213): a
// real welcome-credit grant (friend invite + verified phone + the engine's
// settle sweep) queues a push and an email; deliverQueuedNotificationsCore
// claims them and records what the (fake) senders report -- sent, no
// device, retry, and a switched-off channel.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  type DeliveryDeps,
  type RewardEmail,
  deliverQueuedNotificationsCore,
  isDeliveryTokenValid,
} from "../notifications/deliveryCore";
import {
  bindReferralCodeCore,
  getReferralInviteCore,
} from "../rewards/inviteCore";
import {
  type TestUser,
  createTestUser,
  deleteTestUser,
  getServiceClient,
} from "./setupClient";

type SettingsRow =
  Database["public"]["Tables"]["reward_program_setting"]["Row"];
type Delivery = Database["public"]["Tables"]["notification_delivery"]["Row"];

const FRIEND_RULES = [
  "friend_referral_referrer",
  "friend_referral_referee",
] as const;

// Pushes wait out the night in Accra (21:00-08:00); emails don't.
const accraHour = new Date().getUTCHours(); // Africa/Accra is UTC+0
const pushDueNow = accraHour >= 8 && accraHour <= 20;

describe("reward notice delivery: push + email", () => {
  let service: SupabaseClient<Database>;
  let inviter: TestUser;
  let inviterCode: string;
  let originalSettings: SettingsRow;
  const activeBefore = new Map<string, string | null>();
  const users: TestUser[] = [];

  process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.SUPABASE_TEST_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY =
    process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;

  async function setSettings(patch: Partial<SettingsRow>) {
    const { error } = await service
      .from("reward_program_setting")
      .update(patch)
      .eq("id", 1);
    expect(error).toBeNull();
  }

  async function verifyPhone(user: TestUser) {
    const { error } = await service.auth.admin.updateUserById(user.id, {
      phone: `23324${Math.floor(1_000_000 + Math.random() * 8_999_999)}`,
      phone_confirm: true,
    });
    expect(error).toBeNull();
  }

  /** A new friend who gets welcome credit (and so a reward notice). */
  async function friendWithWelcomeCredit(): Promise<TestUser> {
    const friend = await createTestUser(service);
    users.push(friend);
    await service
      .from("user_info")
      .update({ full_name: "Kofi Boateng" })
      .eq("id", friend.id);
    await verifyPhone(friend);
    const bound = await bindReferralCodeCore(friend.id, {
      code: inviterCode,
      source: "typed",
    });
    expect(bound.data.result).toBe("bound");
    const { error } = await service.rpc("rewards_settle_due", {
      p_limit: 500,
    });
    expect(error).toBeNull();
    return friend;
  }

  async function deliveriesOf(userId: string): Promise<Delivery[]> {
    const { data } = await service
      .from("notification_delivery")
      .select("*")
      .eq("user_id", userId)
      .order("id");
    return data ?? [];
  }

  /** Fake senders that record what they were asked to send. */
  function recorder(
    push: "sent" | "no_devices" | "failed" = "sent",
    email: Awaited<ReturnType<DeliveryDeps["sendEmail"]>> = { ok: true },
  ) {
    const pushes: { userId: string; title: string; body?: string | null }[] =
      [];
    const emails: RewardEmail[] = [];
    const deps: DeliveryDeps = {
      sendPush: async (userId, payload) => {
        pushes.push({ userId, title: payload.title, body: payload.body });
        return push;
      },
      sendEmail: async (message) => {
        emails.push(message);
        return email;
      },
    };
    return { deps, pushes, emails };
  }

  beforeAll(async () => {
    service = getServiceClient();
    inviter = await createTestUser(service);
    await verifyPhone(inviter);

    const { data } = await service
      .from("reward_program_setting")
      .select("*")
      .eq("id", 1)
      .single();
    originalSettings = data as SettingsRow;
    await setSettings({
      rewards_enabled: true,
      audience: "all",
      referral_capture_enabled: true,
      shadow_mode: false,
      notify_push_enabled: true,
      notify_email_enabled: true,
    });

    const { data: rules } = await service
      .from("reward_rule")
      .select("id, rule_key, version, is_active")
      .in("rule_key", [...FRIEND_RULES]);
    for (const key of FRIEND_RULES) {
      activeBefore.set(
        key,
        rules?.find((r) => r.rule_key === key && r.is_active)?.id ?? null,
      );
      const v1 = rules?.find((r) => r.rule_key === key && r.version === 1);
      await service.rpc("reward_rule_set_active", {
        p_rule_key: key,
        p_rule_id: v1?.id as string,
      });
    }

    const invite = await getReferralInviteCore(inviter.id);
    inviterCode = invite.data?.code as string;
    expect(inviterCode).toBeTruthy();
  });

  afterAll(async () => {
    for (const [key, id] of activeBefore) {
      await service.rpc("reward_rule_set_active", {
        p_rule_key: key,
        p_rule_id: id as string,
      });
    }
    await setSettings({
      rewards_enabled: originalSettings.rewards_enabled,
      audience: originalSettings.audience,
      referral_capture_enabled: originalSettings.referral_capture_enabled,
      shadow_mode: originalSettings.shadow_mode,
      notify_push_enabled: originalSettings.notify_push_enabled,
      notify_email_enabled: originalSettings.notify_email_enabled,
    });
    await Promise.all(
      [inviter, ...users].map((u) => deleteTestUser(service, u.id)),
    );
  });

  it("queues a push and an email for welcome credit, and only a push for other notices", async () => {
    const friend = await friendWithWelcomeCredit();
    const rows = await deliveriesOf(friend.id);
    expect(rows.map((r) => [r.channel, r.status])).toEqual([
      ["push", "queued"],
      ["email", "queued"],
    ]);
    expect(rows[0].notification_id).toBe(rows[1].notification_id);
    const { data: note } = await service
      .from("notification")
      .select("type, data")
      .eq("id", rows[0].notification_id)
      .single();
    expect(note).toMatchObject({
      type: "welcome_credit",
      data: { kind: "rewards" },
    });

    // The inviter's "a friend joined" notice is push-only.
    const inviterRows = await deliveriesOf(inviter.id);
    expect(inviterRows.length).toBeGreaterThan(0);
    expect(inviterRows.every((r) => r.channel === "push")).toBe(true);
  });

  it("sends the notice by push and email and records it as sent", async () => {
    const friend = await friendWithWelcomeCredit();
    const { deps, pushes, emails } = recorder();
    const res = await deliverQueuedNotificationsCore(deps);
    expect(res.status).toBe(200);

    const mail = emails.filter((e) => e.to === friend.email);
    expect(mail).toHaveLength(1);
    expect(mail[0].name).toBe("Kofi Boateng");
    expect(mail[0].items).toHaveLength(1);
    expect(mail[0].items[0].title).toBe("You have welcome credit");
    expect(mail[0].items[0].body).toContain("GH₵ 2.00");

    const rows = await deliveriesOf(friend.id);
    const email = rows.find((r) => r.channel === "email");
    const push = rows.find((r) => r.channel === "push");
    expect(email).toMatchObject({ status: "sent", attempts: 1 });
    if (pushDueNow) {
      expect(pushes.filter((p) => p.userId === friend.id)).toEqual([
        expect.objectContaining({ title: "You have welcome credit" }),
      ]);
      expect(push).toMatchObject({ status: "sent", attempts: 1 });
    } else {
      // Night in Accra: the push waits for the morning.
      expect(pushes.some((p) => p.userId === friend.id)).toBe(false);
      expect(push).toMatchObject({ status: "queued", attempts: 0 });
    }

    // Nothing is sent twice.
    const again = recorder();
    await deliverQueuedNotificationsCore(again.deps);
    expect(again.emails.some((e) => e.to === friend.email)).toBe(false);
    expect(again.pushes.some((p) => p.userId === friend.id)).toBe(false);
  });

  it("skips people without a device, retries a failed email, and gives up after 5 tries", async () => {
    const friend = await friendWithWelcomeCredit();
    const failing = recorder("no_devices", {
      ok: false,
      error: "resend down",
      outcome: "retry",
    });
    await deliverQueuedNotificationsCore(failing.deps);
    let rows = await deliveriesOf(friend.id);
    expect(rows.find((r) => r.channel === "email")).toMatchObject({
      status: "queued",
      attempts: 1,
      detail: "resend down",
    });
    if (pushDueNow) {
      expect(rows.find((r) => r.channel === "push")).toMatchObject({
        status: "skipped",
        detail: "no_device",
      });
    }

    for (let i = 0; i < 4; i += 1) {
      await deliverQueuedNotificationsCore(failing.deps);
    }
    rows = await deliveriesOf(friend.id);
    expect(rows.find((r) => r.channel === "email")).toMatchObject({
      status: "failed",
      attempts: 5,
    });
  });

  it("skips what's waiting for a switched-off channel", async () => {
    const friend = await friendWithWelcomeCredit();
    await setSettings({
      notify_email_enabled: false,
      notify_push_enabled: false,
    });
    try {
      const { deps, pushes, emails } = recorder();
      await deliverQueuedNotificationsCore(deps);
      expect(emails.some((e) => e.to === friend.email)).toBe(false);
      expect(pushes.some((p) => p.userId === friend.id)).toBe(false);
      const rows = await deliveriesOf(friend.id);
      expect(rows.map((r) => [r.status, r.detail])).toEqual([
        ["skipped", "channel_off"],
        ["skipped", "channel_off"],
      ]);
    } finally {
      await setSettings({
        notify_email_enabled: true,
        notify_push_enabled: true,
      });
    }
  });

  it("only the cron job's token is accepted, and clients can't read the queue", async () => {
    const { data } = await service
      .from("notification_delivery_config")
      .select("token")
      .eq("id", true)
      .single();
    const token = data?.token as string;
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    expect(await isDeliveryTokenValid(token)).toBe(true);
    const wrong = `${token.slice(0, -1)}${token.endsWith("0") ? "1" : "0"}`;
    expect(await isDeliveryTokenValid(wrong)).toBe(false);
    expect(await isDeliveryTokenValid("nope")).toBe(false);
    expect(await isDeliveryTokenValid(null)).toBe(false);

    const friend = users[0];
    const own = await friend.client.from("notification_delivery").select("id");
    expect(own.error?.code ?? "").toBe("42501");
    const cfg = await friend.client
      .from("notification_delivery_config")
      .select("token");
    expect(cfg.error?.code ?? "").toBe("42501");
    const claim = await friend.client.rpc("notification_delivery_claim", {
      p_limit: 10,
    });
    expect(claim.error).not.toBeNull();
    const finish = await friend.client.rpc("notification_delivery_finish", {
      p_ids: [1],
      p_status: "sent",
    });
    expect(finish.error).not.toBeNull();
  });
});
