import type { Database } from "@abonten/types/database.types";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import type { SupabaseClient } from "@supabase/supabase-js";
// Requires a local Supabase stack (npm run test:db:up at the repo root).
//
// Team accounts, emails (docs/architecture/team-accounts.md §4j): an email
// queued for a team (here the real one: Abonten Rewards pays a verified
// team-run place its visit credit and emails about it) goes to the members
// who got a copy of the notice (Owners and Finance, for credit), each under
// their own email preference, and says whose credit it is; the team's own
// row is closed, never sent to its placeholder address.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  type DeliveryDeps,
  type RewardEmail,
  deliverQueuedNotificationsCore,
} from "../notifications/deliveryCore";
import {
  answerTeamInviteCore,
  createTeamCore,
  inviteTeamMemberCore,
} from "../teams/teamCore";
import { resetTeamSettingsCache } from "../teams/teamProgram";
import {
  type TestUser,
  createTestUser,
  deleteTestUser,
  getServiceClient,
} from "./setupClient";

type SettingsRow =
  Database["public"]["Tables"]["reward_program_setting"]["Row"];

const noText = { canTextNumber: async () => false };
const HERE = { lat: 5.6037, lng: -0.187 };

describe("emails about a team reach its members", () => {
  let service: SupabaseClient<Database>;
  let svc: ServiceRoleClient;
  const users: TestUser[] = [];
  let owner: TestUser;
  let finance: TestUser;
  let content: TestUser;
  let teamId: string;
  let placeId: string;
  let original: SettingsRow;
  let visitsRuleBefore: string | null = null;

  process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.SUPABASE_TEST_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY =
    process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;

  async function person(
    opts: { phone?: boolean; ageDays?: number } = {},
  ): Promise<TestUser> {
    const u = await createTestUser(service);
    users.push(u);
    await service
      .from("user_info")
      .update({
        username: `te_${u.id.slice(0, 8)}`,
        full_name: "Mail Person",
        ...(opts.ageDays
          ? {
              created_at: new Date(
                Date.now() - opts.ageDays * 86_400_000,
              ).toISOString(),
            }
          : {}),
      })
      .eq("id", u.id);
    if (opts.phone) {
      await service.auth.admin.updateUserById(u.id, {
        phone: `23324${Math.floor(1_000_000 + Math.random() * 8_999_999)}`,
        phone_confirm: true,
      });
    }
    return u;
  }

  async function join(who: TestUser, role: "finance" | "content") {
    const sent = await inviteTeamMemberCore(
      svc,
      owner.id,
      {
        teamId,
        role,
        target: { kind: "username", username: `te_${who.id.slice(0, 8)}` },
      },
      noText,
    );
    if (sent.status !== 200) throw new Error(sent.message);
    const res = await answerTeamInviteCore(svc, who.id, {
      adult: true,
      inviteId: sent.data.id,
      action: "accept",
    });
    if (res.status !== 200) throw new Error(res.message);
  }

  const emailRows = async (userId: string) =>
    (
      await service
        .from("notification_delivery")
        .select("status, detail, source")
        .eq("user_id", userId)
        .eq("channel", "email")
        .order("id")
    ).data ?? [];

  beforeAll(async () => {
    service = getServiceClient();
    svc = service as unknown as ServiceRoleClient;
    const { data } = await service
      .from("reward_program_setting")
      .select("*")
      .eq("id", 1)
      .single();
    original = data as SettingsRow;
    await service
      .from("reward_program_setting")
      .update({
        rewards_enabled: true,
        audience: "all",
        shadow_mode: false,
        notify_push_enabled: true,
        notify_email_enabled: true,
      })
      .eq("id", 1);
    const { data: rule } = await service
      .from("reward_rule")
      .select("id, is_active, version")
      .eq("rule_key", "place_visits");
    visitsRuleBefore = rule?.find((r) => r.is_active)?.id ?? null;
    await service.rpc("reward_rule_set_active", {
      p_rule_key: "place_visits",
      p_rule_id: rule?.find((r) => r.version === 1)?.id as string,
    });
    await service
      .from("team_program_setting")
      .update({ enabled: true, audience: "all" })
      .eq("id", 1);
    resetTeamSettingsCache();

    // A team's reward is released once an Owner has a verified phone (a
    // team account has none of its own).
    owner = await person({ phone: true });
    [finance, content] = await Promise.all([
      person(),
      // A member who looks like a real visitor (phone, an old account).
      person({ phone: true, ageDays: 90 }),
    ]);
    const made = await createTeamCore(svc, owner.id, {
      adult: true,
      name: "Mail Crew",
      username: `tet_${crypto.randomUUID().slice(0, 8)}`,
    });
    if (made.status !== 200) throw new Error(made.message);
    teamId = made.data.id;
    await join(finance, "finance");
    await join(content, "content");

    const { data: category } = await service
      .from("place_category")
      .select("id")
      .limit(1)
      .single();
    const { data: place, error } = await service
      .from("place")
      .insert({
        country_code: "GH",
        timezone: "Africa/Accra",
        owner_id: teamId,
        name: "Mail Crew Lounge",
        slug: `mail-crew-lounge-${crypto.randomUUID()}`,
        description: "A team-run place.",
        category_id: category?.id as number,
        location: `POINT(${HERE.lng} ${HERE.lat})`,
        address: { city: "Accra", country: "Ghana" },
        cover_public_id: "test/cover",
        cover_version: "1",
        status: "published",
        verified: true,
        claimed: true,
      } as never)
      .select("id")
      .single();
    if (error || !place) throw new Error(error?.message);
    placeId = (place as { id: string }).id;
  });

  afterAll(async () => {
    await service
      .from("reward_program_setting")
      .update({
        rewards_enabled: original.rewards_enabled,
        audience: original.audience,
        shadow_mode: original.shadow_mode,
        notify_push_enabled: original.notify_push_enabled,
        notify_email_enabled: original.notify_email_enabled,
      })
      .eq("id", 1);
    await service.rpc("reward_rule_set_active", {
      p_rule_key: "place_visits",
      p_rule_id: visitsRuleBefore as string,
    });
    await service
      .from("team_program_setting")
      .update({ enabled: false })
      .eq("id", 1);
    resetTeamSettingsCache();
    await service.from("place_visit").delete().eq("place_id", placeId);
    await service.from("notification").delete().eq("user_id", teamId);
    await Promise.all(users.map((u) => deleteTestUser(service, u.id)));
  });

  it("sends the team's reward email to its Owners and Finance, never to the team", async () => {
    // Last month, three verified visitors came to the team's place: the
    // monthly run pays the team visit credit and queues its email.
    const lastMonth = new Date();
    lastMonth.setUTCDate(1);
    lastMonth.setUTCMonth(lastMonth.getUTCMonth() - 1);
    const period = lastMonth.toISOString().slice(0, 10);
    const visitedAt = new Date(`${period}T12:00:00Z`).toISOString();
    const visitors = await Promise.all([
      person({ phone: true, ageDays: 90 }),
      person({ phone: true, ageDays: 90 }),
      person({ phone: true, ageDays: 90 }),
    ]);
    // The team's own member visiting does not count (not a visitor).
    const { error } = await service.from("place_visit").insert(
      [...visitors, content].map((v) => ({
        place_id: placeId,
        user_id: v.id,
        visited_on: period,
        distance_m: 10,
        platform: "android",
        created_at: visitedAt,
      })) as never,
    );
    expect(error).toBeNull();
    const { error: runError } = await service.rpc(
      "rewards_run_monthly_rebates",
      { p_period_start: period },
    );
    expect(runError).toBeNull();
    const { data: decided } = await service
      .from("reward_event")
      .select("status, basis")
      .eq("rule_key", "place_visits")
      .eq("source_id", placeId)
      .eq("is_shadow", false)
      .single();
    expect(decided?.status).toBe("released");
    expect(decided?.basis).toMatchObject({ visitors: 4, counted_visitors: 3 });

    expect(await emailRows(teamId)).toEqual([
      { status: "skipped", detail: "sent_to_members", source: "rewards" },
    ]);
    expect(await emailRows(owner.id)).toEqual([
      { status: "queued", detail: null, source: "rewards" },
    ]);
    expect(await emailRows(finance.id)).toEqual([
      { status: "queued", detail: null, source: "rewards" },
    ]);
    expect(await emailRows(content.id)).toEqual([]);

    // Finance has stopped reward emails: their own choice holds.
    await service
      .from("notification_preference")
      .upsert({ user_id: finance.id, reward_emails: false } as never, {
        onConflict: "user_id",
      });

    // The delivery run sends the Owner one email that names the team.
    const emails: RewardEmail[] = [];
    const deps: DeliveryDeps = {
      sendPush: async () => "sent",
      sendEmail: async (message) => {
        emails.push(message);
        return { ok: true };
      },
    };
    const run = await deliverQueuedNotificationsCore(deps);
    expect(run.status).toBe(200);
    const toOwner = emails.find((e) => e.userId === owner.id);
    expect(toOwner?.team?.id).toBe(teamId);
    expect(toOwner?.team?.name).toBe("Mail Crew");
    expect(toOwner?.to).toBe(owner.email);
    expect(emails.some((e) => e.userId === teamId)).toBe(false);
    expect(emails.some((e) => e.userId === finance.id)).toBe(false);
    expect(await emailRows(owner.id)).toEqual([
      { status: "sent", detail: null, source: "rewards" },
    ]);
    expect((await emailRows(finance.id)).map((r) => r.detail)).toEqual([
      "opted_out",
    ]);
  });
});
