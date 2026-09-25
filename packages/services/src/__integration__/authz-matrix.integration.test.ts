import type { Database } from "@abonten/types/database.types";
import { type SupabaseClient, createClient } from "@supabase/supabase-js";
// Requires a local Supabase stack (npm run test:db:up at the repo root).
//
// Production gate (2026-09-25): what each kind of account can do to OTHER
// people's data straight through the Data API (the path every client key
// allows, whatever the apps do). Every role gets its own real session; the
// "victim" owns one row in each table. For each role × table the test
// records whether the role can READ the victim's rows, TAKE OVER a row
// (rewrite its owner to itself), INSERT a row in the victim's name, or
// DELETE the victim's row — then asserts that only the listed exceptions
// are possible. The printed matrix is the evidence in the production-gate
// report.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  type TestUser,
  createTestEventWithTicketType,
  createTestUser,
  deleteTestEvent,
  deleteTestUser,
  getServiceClient,
} from "./setupClient";

type Role =
  | "anon"
  | "customer"
  | "buyer"
  | "organizer"
  | "placeOwner"
  | "banned"
  | "analyst"
  | "admin"
  | "superAdmin";

type Probe = {
  read: boolean;
  takeover: boolean;
  insert: boolean;
  del: boolean;
};

// Rows owned by the victim, one per table, created in beforeAll.
type Target = {
  table: string;
  owner: string;
  id?: string;
  /** Extra columns needed to insert a forged row. */
  forge?: Record<string, unknown>;
};

// Anything another account may legitimately see of the victim's data.
// Everything else — and any write — must be refused.
const ALLOWED_READ: Partial<Record<string, Role[]>> = {
  // Public profile (username, name, avatar) — the whole table is public.
  user_info: [
    "anon",
    "customer",
    "buyer",
    "organizer",
    "placeOwner",
    "banned",
    "analyst",
    "admin",
    "superAdmin",
  ],
};

// Staff may read other people's data in these tables only when their role
// holds the permission (migration 20260925110900), never for being staff.
const STAFF_READ_PERMISSION: Partial<Record<string, string>> = {
  report: "reports.view",
  message: "support.view",
  conversation: "support.view",
};

describe("authorization matrix (direct Data API)", () => {
  let service: SupabaseClient<Database>;
  const clients = new Map<Role, SupabaseClient<Database>>();
  const ids = new Map<Role, string>();
  const created: TestUser[] = [];
  let victim: TestUser;
  let eventId: string;
  const targets: Target[] = [];
  const matrix = new Map<string, Map<Role, Probe>>();
  const permissions = new Map<Role, Set<string>>();

  beforeAll(async () => {
    service = getServiceClient();
    const make = async () => {
      const u = await createTestUser(service);
      created.push(u);
      return u;
    };
    victim = await make();
    const roles: Role[] = [
      "customer",
      "buyer",
      "organizer",
      "placeOwner",
      "banned",
      "analyst",
      "admin",
      "superAdmin",
    ];
    for (const role of roles) {
      const u = await make();
      clients.set(role, u.client);
      ids.set(role, u.id);
    }
    clients.set(
      "anon",
      createClient<Database>(
        process.env.SUPABASE_TEST_URL as string,
        process.env.SUPABASE_TEST_ANON_KEY as string,
        { auth: { persistSession: false } },
      ),
    );
    ids.set("anon", "00000000-0000-4000-8000-000000000000");
    const staff: [Role, string][] = [
      ["analyst", "analyst"],
      ["admin", "operations"],
      ["superAdmin", "super_admin"],
    ];
    for (const [role, key] of staff) {
      const id = ids.get(role) as string;
      await service
        .from("admin_user")
        .insert({ user_id: id, status: "active" });
      await service
        .from("admin_user_role")
        .insert({ user_id: id, role_key: key });
    }
    for (const [role, key] of staff) {
      const { data } = await service
        .from("admin_role_permission")
        .select("permission_key")
        .eq("role_key", key);
      permissions.set(role, new Set((data ?? []).map((r) => r.permission_key)));
    }
    // Banned after sign-in: the token is still valid (the window under test).
    await service
      .from("user_info")
      .update({ status_id: 3 })
      .eq("id", ids.get("banned") as string);

    // The victim's data.
    ({ eventId } = await createTestEventWithTicketType(service, victim.id, {
      quantity: 5,
      price: 20,
    }));
    const one = async (
      table: string,
      owner: string,
      row: Record<string, unknown>,
      forge?: Record<string, unknown>,
    ) => {
      const { data, error } = await service
        .from(table as never)
        .insert(row as never)
        .select("id")
        .single();
      if (error) throw new Error(`${table}: ${error.message}`);
      // A forged row carries every column the real one needed, so a refused
      // insert means "not allowed", not "missing a column".
      const clone = { ...row, ...(forge ?? {}) };
      if ("provider_reference" in clone)
        clone.provider_reference = `PSK-${crypto.randomUUID()}`;
      if ("dedupe_key" in clone)
        clone.dedupe_key = `forged:${crypto.randomUUID()}`;
      targets.push({
        table,
        owner,
        id: (data as { id: string }).id,
        forge: clone,
      });
    };
    await one("payment_method", "user_id", {
      user_id: victim.id,
      method_type: "momo",
      details: { phone: "+233551234987", networkCode: "MTN" },
      status: "active",
    });
    await one("transaction", "user_id", {
      user_id: victim.id,
      full_name: "Victim",
      email: victim.email,
      reason: "Ticket_Purchase",
      amount: 21,
      currency: "GHS",
      status: "successful",
      provider: "paystack",
      provider_reference: `PSK-${crypto.randomUUID()}`,
    });
    await one("notification", "user_id", {
      user_id: victim.id,
      type: "system",
      title: "Private",
      body: "For the victim only",
    });
    await one("payout_account", "organizer_id", {
      organizer_id: victim.id,
      account_type: "mobile_money",
      account_holder_name: "Victim",
      account_number: "+233551234987",
      country_code: "GH",
      currency: "GHS",
    });
    await one("report", "reporter_id", {
      reporter_id: victim.id,
      target_type: "event",
      target_id: eventId,
      category: "spam",
      dedupe_key: `victim:${crypto.randomUUID()}`,
    });
    // Tables with no row written above still get READ probes on existing
    // rows owned by someone else.
    for (const [table, owner] of [
      ["payment_attempt", "user_id"],
      ["ticket", "user_id"],
      ["ticket_checkout", "user_id"],
      ["organizer_ledger_entry", "organizer_id"],
      ["payout", "organizer_id"],
      ["credit_account", "user_id"],
      ["place_booking", "customer_id"],
      ["verification_case", "requester_id"],
      ["message", "sender_id"],
      ["conversation", "created_by"],
    ] as const) {
      targets.push({ table, owner });
    }
  });

  afterAll(async () => {
    for (const t of targets.filter((t) => t.id)) {
      await service
        .from(t.table as never)
        .delete()
        .eq("id", t.id as string);
    }
    for (const role of ["analyst", "admin", "superAdmin"] as Role[]) {
      const id = ids.get(role) as string;
      await service.from("admin_user_role").delete().eq("user_id", id);
      await service.from("admin_user").delete().eq("user_id", id);
    }
    await deleteTestEvent(service, eventId).catch(() => undefined);
    await Promise.all(created.map((u) => deleteTestUser(service, u.id)));
  });

  const ROLES: Role[] = [
    "anon",
    "customer",
    "buyer",
    "organizer",
    "placeOwner",
    "banned",
    "analyst",
    "admin",
    "superAdmin",
  ];

  async function probe(role: Role, t: Target): Promise<Probe> {
    const c = clients.get(role) as SupabaseClient<Database>;
    const me = ids.get(role) as string;
    // READ: rows of this table that aren't mine.
    const { count } = await c
      .from(t.table as never)
      .select("*", { count: "exact", head: true })
      .neq(t.owner, me);
    const read = (count ?? 0) > 0;
    let takeover = false;
    let insert = false;
    let del = false;
    if (t.id) {
      // TAKEOVER: rewrite the victim's row to be mine.
      await c
        .from(t.table as never)
        .update({ [t.owner]: me } as never)
        .eq("id", t.id);
      const { data: after } = await service
        .from(t.table as never)
        .select(t.owner)
        .eq("id", t.id)
        .single();
      takeover = (after as Record<string, string> | null)?.[t.owner] === me;
      if (takeover) {
        await service
          .from(t.table as never)
          .update({ [t.owner]: victim.id } as never)
          .eq("id", t.id);
      }
      // DELETE the victim's row.
      await c
        .from(t.table as never)
        .delete()
        .eq("id", t.id);
      const { data: still } = await service
        .from(t.table as never)
        .select("id")
        .eq("id", t.id)
        .maybeSingle();
      del = !still;
      // INSERT a row in the victim's name.
      const { data: forged } = await c
        .from(t.table as never)
        .insert({ [t.owner]: victim.id, ...(t.forge ?? {}) } as never)
        .select("id");
      insert = !!forged && (forged as unknown[]).length > 0;
      if (insert) {
        for (const row of forged as { id: string }[]) {
          await service
            .from(t.table as never)
            .delete()
            .eq("id", row.id);
        }
      }
    }
    return { read, takeover, insert, del };
  }

  it("builds the matrix and finds no unexpected access", async () => {
    for (const t of targets) {
      const row = new Map<Role, Probe>();
      for (const role of ROLES) row.set(role, await probe(role, t));
      matrix.set(t.table, row);
    }
    // user_info is public to read; writes to another person's row must fail.
    const privileged = new Map<Role, boolean>();
    for (const role of ROLES) {
      const c = clients.get(role) as SupabaseClient<Database>;
      await c
        .from("user_info")
        .update({ status_id: 3, is_admin: true } as never)
        .eq("id", victim.id);
      const { data } = await service
        .from("user_info")
        .select("status_id, is_admin")
        .eq("id", victim.id)
        .single();
      privileged.set(role, data?.status_id === 3 || data?.is_admin === true);
      await service
        .from("user_info")
        .update({ status_id: 1, is_admin: false })
        .eq("id", victim.id);
    }

    const cell = (p: Probe) =>
      `${p.read ? "R" : "-"}${p.takeover ? "T" : "-"}${p.insert ? "I" : "-"}${p.del ? "D" : "-"}`;
    const lines = [
      `| table | ${ROLES.join(" | ")} |`,
      `|---|${ROLES.map(() => "---").join("|")}|`,
      ...[...matrix].map(
        ([table, row]) =>
          `| ${table} | ${ROLES.map((r) => cell(row.get(r) as Probe)).join(" | ")} |`,
      ),
      `| user_info (ban / grant admin on someone else) | ${ROLES.map((r) => (privileged.get(r) ? "W" : "-")).join(" | ")} |`,
    ];
    console.log(
      `\nAUTHZ MATRIX (R read · T take over · I forge · D delete)\n${lines.join("\n")}\n`,
    );

    const unexpected: string[] = [];
    for (const [table, row] of matrix) {
      for (const role of ROLES) {
        const p = row.get(role) as Probe;
        const byPermission =
          STAFF_READ_PERMISSION[table] !== undefined &&
          (permissions.get(role)?.has(STAFF_READ_PERMISSION[table] as string) ??
            false);
        if (
          p.read &&
          !byPermission &&
          !(ALLOWED_READ[table] ?? []).includes(role)
        )
          unexpected.push(`${role} reads ${table}`);
        if (p.takeover) unexpected.push(`${role} takes over ${table}`);
        if (p.insert) unexpected.push(`${role} forges ${table}`);
        if (p.del) unexpected.push(`${role} deletes ${table}`);
      }
    }
    for (const role of ROLES) {
      if (privileged.get(role))
        unexpected.push(`${role} bans / grants admin on another account`);
    }
    expect(unexpected).toEqual([]);
  });
});

describe("staff sessions on the Data API (migration 20260925110900)", () => {
  it("a super admin's own session can't rewrite someone else's place or claim", async () => {
    const service = getServiceClient();
    const [owner, staffer] = await Promise.all([
      createTestUser(service),
      createTestUser(service),
    ]);
    await service
      .from("admin_user")
      .insert({ user_id: staffer.id, status: "active" });
    await service
      .from("admin_user_role")
      .insert({ user_id: staffer.id, role_key: "super_admin" });
    const { data: category } = await service
      .from("place_category")
      .select("id")
      .limit(1)
      .single();
    const { data: place } = await service
      .from("place")
      .insert({
        country_code: "GH",
        timezone: "Africa/Accra",
        owner_id: owner.id,
        name: "Staff Probe Venue",
        slug: `staff-probe-${crypto.randomUUID()}`,
        description: "Created by the authz-matrix suite.",
        category_id: category?.id as number,
        location: "POINT(-0.187 5.6037)",
        address: { city: "Accra" },
        cover_public_id: "test/cover",
        cover_version: "1",
        status: "published",
      })
      .select("id")
      .single();
    const placeId = place?.id as string;
    try {
      await staffer.client
        .from("place")
        .update({ verified: true, name: "Hijacked" } as never)
        .eq("id", placeId);
      const { data: after } = await service
        .from("place")
        .select("verified, name")
        .eq("id", placeId)
        .single();
      expect(after).toMatchObject({
        verified: false,
        name: "Staff Probe Venue",
      });
    } finally {
      await service.from("place").delete().eq("id", placeId);
      await service.from("admin_user_role").delete().eq("user_id", staffer.id);
      await service.from("admin_user").delete().eq("user_id", staffer.id);
      await Promise.all(
        [owner, staffer].map((u) => deleteTestUser(service, u.id)),
      );
    }
  });
});
