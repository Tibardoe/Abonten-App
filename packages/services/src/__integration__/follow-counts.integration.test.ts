import type { Database } from "@abonten/types/database.types";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getFollowStatusCore, setFollowCore } from "../content/followCore";
import {
  type TestUser,
  createTestUser,
  deleteTestUser,
  getServiceClient,
} from "./setupClient";

// Follower counts (migration 20260919092000): follow_count is kept exact by
// a trigger in the same transaction as each follow / unfollow, including
// under concurrent follows, and get_public_profile returns the profile, the
// count and the caller's own follow state in one call, through RLS.

process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.SUPABASE_TEST_URL;
process.env.SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;

const svc = getServiceClient() as unknown as ServiceRoleClient;
const anon = createClient<Database>(
  process.env.SUPABASE_TEST_URL as string,
  process.env.SUPABASE_TEST_ANON_KEY as string,
  { auth: { persistSession: false } },
);

const TOKEN = `fc${Date.now().toString(36)}`;
let organizer: TestUser;
const fans: TestUser[] = [];

type Profile = {
  user_id: string;
  username: string;
  follower_count: number;
  viewer_follows: boolean;
  total_posts: number;
  organizer_verified: boolean;
};

async function profileAs(
  client: typeof anon | TestUser["client"],
): Promise<Profile> {
  const { data, error } = await client.rpc(
    "get_public_profile" as never,
    {
      p_username: `${TOKEN}_org`,
    } as never,
  );
  expect(error).toBeNull();
  return data as unknown as Profile;
}

beforeAll(async () => {
  const service = getServiceClient();
  organizer = await createTestUser(service);
  for (let i = 0; i < 6; i++) fans.push(await createTestUser(service));
  await svc
    .from("user_info")
    .update({ username: `${TOKEN}_org`, full_name: "Count Org" })
    .eq("id", organizer.id);
}, 60_000);

afterAll(async () => {
  const service = getServiceClient();
  for (const u of [organizer, ...fans]) {
    if (u) await deleteTestUser(service, u.id);
  }
});

describe("follow counts", () => {
  it("starts at zero and the profile says so", async () => {
    const p = await profileAs(anon);
    expect(p.user_id).toBe(organizer.id);
    expect(p.follower_count).toBe(0);
    expect(p.viewer_follows).toBe(false);
  });

  it("stays exact under concurrent follows, and follows back down", async () => {
    const results = await Promise.all(
      fans.map((f) =>
        setFollowCore(svc, f.id, {
          targetKind: "organizer",
          targetId: organizer.id,
          following: true,
        }),
      ),
    );
    for (const r of results) expect(r.status, r.message).toBe(200);

    const { data } = await svc
      .from("follow_count")
      .select("follower_count")
      .eq("target_kind", "organizer")
      .eq("target_id", organizer.id)
      .single();
    expect(data?.follower_count).toBe(fans.length);

    // A repeated follow is a no-op, not a double count.
    await setFollowCore(svc, fans[0].id, {
      targetKind: "organizer",
      targetId: organizer.id,
      following: true,
    });
    expect((await profileAs(anon)).follower_count).toBe(fans.length);

    const off = await setFollowCore(svc, fans[1].id, {
      targetKind: "organizer",
      targetId: organizer.id,
      following: false,
    });
    expect(off.data?.followerCount).toBe(fans.length - 1);
    const status = await getFollowStatusCore(svc, fans[1].id, {
      targetKind: "organizer",
      targetId: organizer.id,
    });
    expect(status.data).toEqual({
      following: false,
      followerCount: fans.length - 1,
    });
  }, 60_000);

  it("tells the caller whether they follow, and nobody else", async () => {
    expect((await profileAs(fans[0].client)).viewer_follows).toBe(true);
    expect((await profileAs(fans[1].client)).viewer_follows).toBe(false);
    expect((await profileAs(anon)).viewer_follows).toBe(false);
  });

  it("shows the count on your own profile too", async () => {
    const own = await profileAs(organizer.client);
    expect(own.follower_count).toBe(fans.length - 1);
  });

  it("keeps who-follows-whom private while the number is public", async () => {
    const rows = await anon.from("follow").select("follower_id").limit(5);
    expect(rows.data ?? []).toHaveLength(0);
    const counts = await anon
      .from("follow_count" as never)
      .select("follower_count")
      .eq("target_id", organizer.id);
    expect(counts.error).toBeNull();
    // No client can write the number: the update is refused or matches
    // nothing, and the count is unchanged either way.
    await fans[2].client
      .from("follow_count" as never)
      .update({ follower_count: 999 } as never)
      .eq("target_id", organizer.id);
    expect((await profileAs(anon)).follower_count).toBe(fans.length - 1);
  });
});
