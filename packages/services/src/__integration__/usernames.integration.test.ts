import type { Database } from "@abonten/types/database.types";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import type { SupabaseClient } from "@supabase/supabase-js";
// Requires a local Supabase stack (npm run test:db:up at the repo root).
//
// Usernames that change (migration 20261125100000): the as-you-type check
// answers available / taken / invalid with free suggestions and is
// rate-limited; an old handle is held for its account for 30 days (nobody
// else may take it, the account may take it back) and redirects to the new
// one; a deletion's placeholder handle keeps nothing; a person's own save
// still answers "taken" on a race (the database's unique index and hold).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { updateProfileCore } from "../profile/updateProfileCore";
import { checkUsernameAvailabilityCore } from "../profile/usernameAvailabilityCore";
import {
  type TestUser,
  createTestUser,
  deleteTestUser,
  getServiceClient,
} from "./setupClient";

describe("usernames: availability, suggestions, the 30-day hold and redirect", () => {
  let service: SupabaseClient<Database>;
  let svc: ServiceRoleClient;
  const users: TestUser[] = [];

  const tag = () => crypto.randomUUID().replace(/-/g, "").slice(0, 8);

  async function person(handle: string, name = "Handle Person") {
    const u = await createTestUser(service);
    users.push(u);
    const { error } = await service
      .from("user_info")
      .update({ username: handle, full_name: name })
      .eq("id", u.id);
    if (error) throw new Error(error.message);
    return u;
  }

  beforeAll(() => {
    service = getServiceClient();
    svc = service as unknown as ServiceRoleClient;
  });

  afterAll(async () => {
    await Promise.all(users.map((u) => deleteTestUser(service, u.id)));
  });

  it("says invalid without looking anything up, with the reason", async () => {
    const asker = await person(`un_a_${tag()}`);
    const short = await checkUsernameAvailabilityCore(svc, asker.id, {
      username: "@ab",
    });
    expect(short.status).toBe(200);
    if (short.status !== 200) return;
    expect(short.data).toMatchObject({ state: "invalid", problem: "short" });
    const reserved = await checkUsernameAvailabilityCore(svc, asker.id, {
      username: "deleted_abc123",
    });
    expect(reserved.status === 200 && reserved.data.problem).toBe("reserved");
  });

  it("answers available, yours and taken (without case), with free suggestions", async () => {
    const handle = `un_b_${tag()}`;
    const holder = await person(handle, "Echo Nights");
    const asker = await person(`un_c_${tag()}`, "Ama Owusu");

    const free = await checkUsernameAvailabilityCore(svc, asker.id, {
      username: `free_${tag()}`,
    });
    expect(free.status === 200 && free.data.state).toBe("available");

    const own = await checkUsernameAvailabilityCore(svc, holder.id, {
      username: handle.toUpperCase(),
    });
    expect(own.status === 200 && own.data.state).toBe("yours");

    // Somebody already uses one of the suggestions: it is not offered.
    await person(`${handle}_gh`);
    const taken = await checkUsernameAvailabilityCore(svc, asker.id, {
      username: handle.toUpperCase(),
    });
    expect(taken.status).toBe(200);
    if (taken.status !== 200) return;
    expect(taken.data.state).toBe("taken");
    expect(taken.data.suggestions.length).toBeGreaterThanOrEqual(2);
    expect(taken.data.suggestions.length).toBeLessThanOrEqual(3);
    expect(taken.data.suggestions).not.toContain(`${handle}_gh`);
    const { data: rows } = await svc.rpc("username_states", {
      p_usernames: taken.data.suggestions,
      p_for: asker.id,
    });
    for (const row of (rows ?? []) as { state: string }[]) {
      expect(row.state).toBe("available");
    }
  });

  it("holds an old handle for 30 days: taken for others, back for its account, and it redirects", async () => {
    const oldHandle = `un_d_${tag()}`;
    const newHandle = `un_e_${tag()}`;
    const mover = await person(oldHandle);
    const other = await person(`un_f_${tag()}`);

    const moved = await updateProfileCore(mover.client, mover.id, {
      username: newHandle,
    });
    expect(moved.status).toBe(200);
    const { data: history } = await service
      .from("username_history")
      .select("old_username, new_username")
      .eq("user_id", mover.id);
    expect(history?.map((h) => String(h.old_username))).toContain(oldHandle);

    // Links to the old handle find the new one.
    const { data: redirect } = await service.rpc("username_redirect", {
      p_username: oldHandle.toUpperCase(),
    });
    expect(redirect).toBe(newHandle);
    // Anyone may ask (the website's public client asks it).
    const { data: anonRedirect, error: anonError } = await other.client.rpc(
      "username_redirect",
      { p_username: oldHandle },
    );
    expect(anonError).toBeNull();
    expect(anonRedirect).toBe(newHandle);

    // Nobody else may take it: the check says taken and a save is refused.
    const check = await checkUsernameAvailabilityCore(svc, other.id, {
      username: oldHandle,
    });
    expect(check.status === 200 && check.data.state).toBe("taken");
    const grab = await updateProfileCore(other.client, other.id, {
      username: oldHandle,
    });
    expect(grab.status).toBe(409);

    // The account that gave it up may take it back.
    const mine = await checkUsernameAvailabilityCore(svc, mover.id, {
      username: oldHandle,
    });
    expect(mine.status === 200 && mine.data.state).toBe("available");
    const back = await updateProfileCore(mover.client, mover.id, {
      username: oldHandle,
    });
    expect(back.status).toBe(200);
    // Now it is theirs again: no redirect, and the handle they left is held.
    const { data: none } = await service.rpc("username_redirect", {
      p_username: oldHandle,
    });
    expect(none).toBeNull();
    const { data: newRedirect } = await service.rpc("username_redirect", {
      p_username: newHandle,
    });
    expect(newRedirect).toBe(oldHandle);
  });

  it("releases a handle after 30 days", async () => {
    const oldHandle = `un_g_${tag()}`;
    const mover = await person(oldHandle);
    const other = await person(`un_h_${tag()}`);
    await updateProfileCore(mover.client, mover.id, {
      username: `un_i_${tag()}`,
    });
    await service
      .from("username_history")
      .update({
        changed_at: new Date(Date.now() - 31 * 86_400_000).toISOString(),
      })
      .eq("user_id", mover.id);
    const { data: gone } = await service.rpc("username_redirect", {
      p_username: oldHandle,
    });
    expect(gone).toBeNull();
    const taken = await updateProfileCore(other.client, other.id, {
      username: oldHandle,
    });
    expect(taken.status).toBe(200);
  });

  it("keeps nothing for a deleted account (its placeholder is not a change)", async () => {
    const handle = `un_j_${tag()}`;
    const leaver = await person(handle);
    const { error } = await service.rpc("anonymize_deleted_account", {
      p_user_id: leaver.id,
    });
    expect(error).toBeNull();
    const { count } = await service
      .from("username_history")
      .select("id", { count: "exact", head: true })
      .eq("user_id", leaver.id)
      .eq("old_username", handle);
    expect(count).toBe(0);
    const other = await person(`un_k_${tag()}`);
    const check = await checkUsernameAvailabilityCore(svc, other.id, {
      username: handle,
    });
    expect(check.status === 200 && check.data.state).toBe("available");
  });

  it("is rate-limited per person", async () => {
    const asker = await person(`un_l_${tag()}`);
    let limited = false;
    // 70 tries: the limiter counts in fixed windows, so a run that straddles
    // a window still passes 30 in one of them.
    for (let i = 0; i < 70 && !limited; i++) {
      const res = await checkUsernameAvailabilityCore(svc, asker.id, {
        username: `probe_${tag()}`,
      });
      if (res.status === 429) limited = true;
    }
    expect(limited).toBe(true);
  });

  it("keeps the history and the states service-role only", async () => {
    const asker = await person(`un_m_${tag()}`);
    const { error: readError, data } = await asker.client
      .from("username_history")
      .select("id")
      .limit(1);
    expect(readError !== null || (data ?? []).length === 0).toBe(true);
    const { error } = await asker.client.rpc("username_states", {
      p_usernames: ["abc"],
      p_for: asker.id,
    });
    expect(error).not.toBeNull();
  });
});
