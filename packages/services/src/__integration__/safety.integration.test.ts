import type { Database } from "@abonten/types/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  type TestUser,
  createTestEventWithTicketType,
  createTestUser,
  deleteTestEvent,
  deleteTestUser,
  getServiceClient,
} from "./setupClient";

// Abonten Safety end to end against the local stack: contacts and invites,
// SOS, check-ins that lapse, shares, the contact page and its answers,
// "I'm safe", the event team, opt-outs, expiry and housekeeping. Texts are
// captured by replacing the Hubtel sender; everything else is the real
// database, functions, triggers and outbox.

const texts: { to: string; content: string }[] = [];
vi.mock("../sms/hubtelSms", () => ({
  HUBTEL_SMS_ENV: [
    "HUBTEL_API_CLIENT_ID",
    "HUBTEL_API_CLIENT_SECRET",
    "HUBTEL_SMS_SENDER_ID",
  ],
  isHubtelSmsConfigured: () => true,
  sendHubtelSms: async (input: { toE164: string; content: string }) => {
    texts.push({ to: input.toE164, content: input.content });
    return { ok: true, messageId: `test-${texts.length}` };
  },
}));

const { resetSafetySettingsCache } = await import("../safety/safetyProgram");
const {
  addSafetyContactCore,
  removeSafetyContactCore,
  listSafetyContactsCore,
} = await import("../safety/safetyContactsCore");
const {
  getSafetyOverviewCore,
  startSafetySessionCore,
  recordSafetyLocationCore,
  resolveSafetySessionCore,
  updateSafetySessionCore,
  tellEventTeamCore,
} = await import("../safety/safetySessionCore");
const { getSafetyViewCore, acknowledgeSafetyAlertCore } = await import(
  "../safety/safetyViewCore"
);
const { respondSafetyInviteCore, getSafetyInviteCore } = await import(
  "../safety/safetyInviteCore"
);
const { runSafetyDispatchCore } = await import("../safety/safetyDispatchCore");
const { inviteTokenFor, viewTokenFor } = await import("../safety/safetyTokens");
const { invalidateMarketCache } = await import("../markets/marketConfig");

/** The value, or a failed test saying it was missing. */
function must<T>(value: T | null | undefined): T {
  if (value === null || value === undefined)
    throw new Error("expected a value");
  return value;
}

const svc = getServiceClient() as unknown as Parameters<
  typeof getSafetyOverviewCore
>[0];
const raw = getServiceClient() as SupabaseClient<Database>;

const GH_A = "+233241110001";
const GH_B = "+233241110002";
const GH_C = "+233241110003";
const UK = "+447911123456";
const IP = "127.0.0.9";

let person: TestUser;
let friend: TestUser;
let organizer: TestUser;
const created: string[] = [];

async function setProgram(
  patch: Partial<
    Database["public"]["Tables"]["safety_program_setting"]["Update"]
  >,
) {
  const { error } = await raw
    .from("safety_program_setting")
    .update(patch)
    .eq("id", 1);
  if (error) throw new Error(error.message);
  resetSafetySettingsCache();
}

function point(offsetMs = 0) {
  return {
    lat: 5.6037,
    lng: -0.187,
    accuracyM: 12,
    at: new Date(Date.now() + offsetMs).toISOString(),
    source: "device" as const,
  };
}

async function closeOpenSessions(userId: string) {
  await raw
    .from("safety_session")
    .update({
      status: "resolved",
      resolved_at: new Date().toISOString(),
      resolution: "safe",
    })
    .eq("user_id", userId)
    .in("status", ["active", "alerting"]);
}

async function addContact(
  name: string,
  phone: string,
  extra: { email?: string } = {},
) {
  return addSafetyContactCore(svc, person.id, {
    name,
    dialCode: phone.startsWith("+233") ? "+233" : "+44",
    phone: phone.startsWith("+233") ? phone.slice(4) : phone.slice(3),
    email: extra.email ?? null,
    relationship: "friend",
    locale: "en",
  });
}

beforeAll(async () => {
  person = await createTestUser(raw);
  friend = await createTestUser(raw);
  organizer = await createTestUser(raw);
  created.push(person.id, friend.id, organizer.id);
  await raw.auth.admin.updateUserById(person.id, {
    phone: GH_A.slice(1),
    phone_confirm: true,
  });
  await raw
    .from("user_info")
    .update({ full_name: "Ama Mensah", country_code: "GH" })
    .eq("id", person.id);
  await raw
    .from("user_info")
    .update({ full_name: "Event Team Ltd" })
    .eq("id", organizer.id);
  invalidateMarketCache();
  await setProgram({
    enabled: true,
    audience: "all",
    event_team_alerts_enabled: true,
  });
});

afterAll(async () => {
  await setProgram({
    enabled: false,
    audience: "staff",
    event_team_alerts_enabled: false,
    beta_user_ids: [],
  });
  for (const id of created) await deleteTestUser(raw, id);
});

beforeEach(() => {
  texts.length = 0;
});

describe("Abonten Safety tables and functions", () => {
  it("are unreachable with a person's own session", async () => {
    for (const table of [
      "safety_contact",
      "safety_session",
      "safety_location",
      "safety_recipient",
      "safety_message",
      "safety_program_setting",
    ] as const) {
      const { data, error } = await person.client
        .from(table)
        .select("*")
        .limit(1);
      expect(
        error ?? (data && data.length === 0 ? "empty" : null),
        table,
      ).not.toBeNull();
      const insert = await person.client.from(table).insert({} as never);
      expect(insert.error, `${table} insert`).not.toBeNull();
    }
    const rpc = await person.client.rpc("safety_record_locations", {
      p_session_id: crypto.randomUUID(),
      p_user_id: person.id,
      p_points: [],
    });
    expect(rpc.error).not.toBeNull();
  });
});

describe("trusted contacts", () => {
  it("adds contacts, texts a Ghana number its invite, and refuses what it must", async () => {
    const b = await addContact("Kofi", GH_B);
    expect(b.status).toBe(201);
    expect(b.data?.status).toBe("pending");
    expect(b.data?.canText).toBe(true);
    expect(texts).toHaveLength(1);
    expect(texts[0].to).toBe(GH_B);
    expect(texts[0].content).toContain("Ama Mensah");
    expect(texts[0].content).toContain("/trusted/");

    const uk = await addContact("Esi", UK);
    expect(uk.status).toBe(201);
    expect(uk.data?.canText).toBe(false);
    expect(texts).toHaveLength(1);

    expect((await addContact("Kofi again", GH_B)).status).toBe(409);
    expect((await addContact("Me", GH_A)).status).toBe(400);
  });

  it("caps the list at max_contacts", async () => {
    await setProgram({ max_contacts: 3 });
    expect((await addContact("Yaw", GH_C)).status).toBe(201);
    const fourth = await addContact("Abena", "+233241110004");
    expect(fourth.status).toBe(409);
    await setProgram({ max_contacts: 5 });
  });

  it("an invite can be declined, and a declined number is never re-added", async () => {
    const list = await listSafetyContactsCore(svc, person.id);
    const yaw = list.data?.find((c) => c.name === "Yaw");
    expect(yaw).toBeTruthy();
    const token = inviteTokenFor(must(yaw).id);
    const view = await getSafetyInviteCore(svc, token, IP);
    expect(view.data?.personName).toBe("Ama Mensah");
    const declined = await respondSafetyInviteCore(svc, token, "decline", {
      userId: null,
      ip: IP,
    });
    expect(declined.data?.status).toBe("declined");
    expect(
      (await removeSafetyContactCore(svc, person.id, must(yaw).id)).status,
    ).toBe(200);
    expect((await addContact("Yaw", GH_C)).status).toBe(409);
  });

  it("accepting while signed in links the contact's account", async () => {
    const list = await listSafetyContactsCore(svc, person.id);
    const kofi = list.data?.find((c) => c.name === "Kofi");
    const accepted = await respondSafetyInviteCore(
      svc,
      inviteTokenFor(must(kofi).id),
      "accept",
      {
        userId: friend.id,
        ip: IP,
      },
    );
    expect(accepted.data?.status).toBe("accepted");
    const again = await listSafetyContactsCore(svc, person.id);
    expect(again.data?.find((c) => c.name === "Kofi")?.linked).toBe(true);
    const { data: notes } = await raw
      .from("notification")
      .select("type")
      .eq("user_id", person.id)
      .eq("type", "safety_contact_accepted");
    expect(notes?.length).toBe(1);
  });
});

describe("SOS", () => {
  let sessionId = "";
  let kofiRecipient = "";

  it("alerts every contact at once and is idempotent per press", async () => {
    const clientRequestId = crypto.randomUUID();
    const res = await startSafetySessionCore(
      svc,
      person.id,
      {
        kind: "sos",
        clientRequestId,
        location: point(),
        note: "By the main stage",
      },
      { createdVia: "app" },
    );
    expect(res.status).toBe(201);
    const session = must(res.data).session;
    sessionId = session.id;
    expect(session.status).toBe("alerting");
    expect(session.lastLocation?.lat).toBeCloseTo(5.6037);
    expect(session.recipients.map((r) => r.name).sort()).toEqual([
      "Esi",
      "Kofi",
    ]);
    const kofi = must(session.recipients.find((r) => r.name === "Kofi"));
    kofiRecipient = kofi.id;
    expect(kofi.channels.sms).toBe("sent");
    expect(kofi.channels.push).toBe("sent");
    expect(session.textFromPhone.map((x) => x.name)).toEqual(["Esi"]);
    expect(texts).toHaveLength(1);
    expect(texts[0].content).toContain("SOS");
    expect(texts[0].content).toContain("/sos/");
    expect(texts[0].content).toContain("112");

    const { data: pushes } = await raw
      .from("notification")
      .select("type, data")
      .eq("user_id", friend.id)
      .eq("type", "safety_alert");
    expect(pushes?.length).toBe(1);

    const again = await startSafetySessionCore(
      svc,
      person.id,
      { kind: "sos", clientRequestId },
      { createdVia: "app" },
    );
    expect(again.status).toBe(200);
    expect(again.data?.created).toBe(false);
    expect(texts).toHaveLength(1);
  });

  it("takes positions no closer than five seconds apart", async () => {
    // The start's own point was just now; pretend it was a minute ago.
    await raw
      .from("safety_session")
      .update({ last_located_at: new Date(Date.now() - 60_000).toISOString() })
      .eq("id", sessionId);
    const first = await recordSafetyLocationCore(svc, person.id, {
      sessionId,
      points: [point()],
    });
    expect(first.data?.accepted).toBe(1);
    // A device clock ahead of the server's is taken as "now": too soon.
    const tooSoon = await recordSafetyLocationCore(svc, person.id, {
      sessionId,
      points: [point(60_000)],
    });
    expect(tooSoon.data?.accepted).toBe(0);
    const stranger = await recordSafetyLocationCore(svc, friend.id, {
      sessionId,
      points: [point(20_000)],
    });
    expect(stranger.status).toBe(404);
  });

  it("shows the contact where the person is and tells the person who looked and answered", async () => {
    const token = viewTokenFor(kofiRecipient);
    const view = await getSafetyViewCore(svc, token, { ip: IP });
    expect(view.status).toBe(200);
    expect(view.data?.person.name).toBe("Ama Mensah");
    expect(view.data?.locationState).toBe("live");
    expect(view.data?.trail.length).toBeGreaterThanOrEqual(1);
    expect(view.data?.note).toBe("By the main stage");
    expect(view.data?.emergencyNumbers[0]).toEqual({
      service: "all",
      number: "112",
    });

    const ack = await acknowledgeSafetyAlertCore(
      svc,
      { token, acknowledgement: "on_my_way" },
      { ip: IP },
    );
    expect(ack.data?.viewer.acknowledgement).toBe("on_my_way");
    const { data: notes } = await raw
      .from("notification")
      .select("type")
      .eq("user_id", person.id)
      .in("type", ["safety_contact_viewed", "safety_contact_ack"]);
    expect(notes?.map((n) => n.type).sort()).toEqual([
      "safety_contact_ack",
      "safety_contact_viewed",
    ]);

    expect(
      (await getSafetyViewCore(svc, "x".repeat(22), { ip: IP })).status,
    ).toBe(404);
  });

  it("I'm safe tells the people who were texted and hides the location", async () => {
    const res = await resolveSafetySessionCore(svc, person.id, {
      sessionId,
      resolution: "safe",
    });
    expect(res.data?.status).toBe("resolved");
    expect(texts).toHaveLength(1);
    expect(texts[0].to).toBe(GH_B);
    expect(texts[0].content).toContain("safe");
    const view = await getSafetyViewCore(svc, viewTokenFor(kofiRecipient), {
      ip: IP,
    });
    expect(view.data?.locationState).toBe("hidden");
    expect(view.data?.location).toBeNull();
    expect(view.data?.trail).toEqual([]);
    expect(view.data?.pollSeconds).toBeNull();
  });
});

describe("check in on me", () => {
  it("reminds once at the time, then alerts the contacts after the grace", async () => {
    await closeOpenSessions(person.id);
    const res = await startSafetySessionCore(
      svc,
      person.id,
      { kind: "check_in", clientRequestId: crypto.randomUUID(), minutes: 30 },
      { createdVia: "web" },
    );
    expect(res.status).toBe(201);
    const id = must(res.data).session.id;
    expect(res.data?.session.status).toBe("active");
    expect(texts).toHaveLength(0);

    const extended = await updateSafetySessionCore(svc, person.id, {
      sessionId: id,
      extendMinutes: 15,
    });
    expect(Date.parse(must(must(extended.data).dueAt))).toBeGreaterThan(
      Date.parse(must(must(res.data).session.dueAt)),
    );

    // Due one minute ago: inside the grace, so only the reminder.
    await raw
      .from("safety_session")
      .update({ due_at: new Date(Date.now() - 60_000).toISOString() })
      .eq("id", id);
    const first = await runSafetyDispatchCore(svc, {});
    expect(first.data?.reminded).toBe(1);
    expect(first.data?.escalated).toBe(0);
    const second = await runSafetyDispatchCore(svc, {});
    expect(second.data?.reminded).toBe(0);

    // Past the grace: the alert goes.
    await raw
      .from("safety_session")
      .update({ due_at: new Date(Date.now() - 10 * 60_000).toISOString() })
      .eq("id", id);
    const third = await runSafetyDispatchCore(svc, {});
    expect(third.data?.escalated).toBe(1);
    const { data: row } = await raw
      .from("safety_session")
      .select("status, alert_reason")
      .eq("id", id)
      .single();
    expect(row).toEqual({
      status: "alerting",
      alert_reason: "check_in_missed",
    });
    expect(texts.map((t) => t.to)).toEqual([GH_B]);
    expect(texts[0].content).toContain("check");
    const { data: notes } = await raw
      .from("notification")
      .select("type")
      .eq("user_id", person.id)
      .in("type", ["safety_check_in_due", "safety_check_in_escalated"]);
    expect(notes?.map((n) => n.type).sort()).toEqual([
      "safety_check_in_due",
      "safety_check_in_escalated",
    ]);
    const mistake = await resolveSafetySessionCore(svc, person.id, {
      sessionId: id,
      resolution: "false_alarm",
    });
    expect(mistake.data?.resolution).toBe("false_alarm");
  });
});

describe("share my location", () => {
  it("tells only the chosen contacts, and SOS during it alerts everyone on the same link", async () => {
    await closeOpenSessions(person.id);
    const contacts = (await listSafetyContactsCore(svc, person.id)).data ?? [];
    const kofi = must(contacts.find((c) => c.name === "Kofi"));
    const res = await startSafetySessionCore(
      svc,
      person.id,
      {
        kind: "share",
        clientRequestId: crypto.randomUUID(),
        hours: 2,
        contactIds: [kofi.id],
      },
      { createdVia: "app" },
    );
    expect(res.status).toBe(201);
    expect(res.data?.session.recipients.map((r) => r.name)).toEqual(["Kofi"]);
    expect(texts).toHaveLength(1);
    const shareRecipient = must(res.data).session.recipients[0].id;

    const busy = await startSafetySessionCore(
      svc,
      person.id,
      { kind: "check_in", clientRequestId: crypto.randomUUID(), minutes: 30 },
      { createdVia: "app" },
    );
    expect(busy.status).toBe(409);

    const sos = await startSafetySessionCore(
      svc,
      person.id,
      { kind: "sos", clientRequestId: crypto.randomUUID() },
      { createdVia: "app" },
    );
    expect(sos.status).toBe(200);
    expect(sos.data?.escalated).toBe(true);
    expect(sos.data?.session.id).toBe(res.data?.session.id);
    expect(sos.data?.session.recipients.map((r) => r.name).sort()).toEqual([
      "Esi",
      "Kofi",
    ]);
    expect(
      sos.data?.session.recipients.find((r) => r.name === "Kofi")?.id,
    ).toBe(shareRecipient);
    expect(texts).toHaveLength(2);
    await resolveSafetySessionCore(svc, person.id, {
      sessionId: must(sos.data).session.id,
      resolution: "safe",
    });
  });
});

describe("the event team", () => {
  it("is told only on purpose, for an event the person has a ticket to", async () => {
    await closeOpenSessions(person.id);
    const fixture = await createTestEventWithTicketType(raw, organizer.id, {
      quantity: 10,
    });
    try {
      await raw
        .from("event")
        .update({
          starts_at: new Date(Date.now() - 60 * 60_000).toISOString(),
          ends_at: new Date(Date.now() + 3 * 60 * 60_000).toISOString(),
        })
        .eq("id", fixture.eventId);
      await raw
        .from("event_occurrence")
        .delete()
        .eq("event_id", fixture.eventId);
      const { error: ticketError } = await raw.from("ticket").insert({
        user_id: person.id,
        ticket_type_id: fixture.ticketTypeId,
        status: "active",
        qr_public_id: "test/qr",
        qr_version: "1",
        expires_at: new Date(Date.now() + 86_400_000).toISOString(),
        issued_at: new Date().toISOString(),
      } as never);
      expect(ticketError).toBeNull();

      const overview = await getSafetyOverviewCore(svc, person.id);
      expect(overview.data?.eventChoices[0]?.id).toBe(fixture.eventId);
      expect(overview.data?.eventChoices[0]?.timing).toBe("ongoing");

      const sos = await startSafetySessionCore(
        svc,
        person.id,
        {
          kind: "sos",
          clientRequestId: crypto.randomUUID(),
          eventId: fixture.eventId,
        },
        { createdVia: "app" },
      );
      expect(sos.data?.session.event?.id).toBe(fixture.eventId);
      expect(sos.data?.session.canTellEventTeam).toBe(true);

      // The contact sees who runs the event and whether their identity is
      // checked — never their legal identity.
      await raw
        .from("user_info")
        .update({ full_name: "Kwesi Events" })
        .eq("id", organizer.id);
      const contact = must(
        sos.data?.session.recipients.find((r) => r.kind === "contact"),
      );
      const seen = await getSafetyViewCore(svc, viewTokenFor(contact.id), {
        ip: IP,
      });
      expect(seen.data?.event?.organizer).toEqual({
        name: "Kwesi Events",
        identityChecked: false,
        verified: false,
      });
      expect(seen.data?.event).toHaveProperty("venuePhone");
      const told = await tellEventTeamCore(
        svc,
        person.id,
        must(sos.data).session.id,
      );
      expect(told.data?.eventTeamNotifiedAt).not.toBeNull();
      expect(told.data?.recipients.some((r) => r.kind === "event_team")).toBe(
        true,
      );
      const { data: notes } = await raw
        .from("notification")
        .select("type")
        .eq("user_id", organizer.id)
        .eq("type", "safety_event_team");
      expect(notes?.length).toBe(1);
      await resolveSafetySessionCore(svc, person.id, {
        sessionId: must(sos.data).session.id,
        resolution: "safe",
      });
    } finally {
      await raw.from("ticket").delete().eq("user_id", person.id);
      await deleteTestEvent(raw, fixture.eventId);
    }
  });
});

describe("deleting an account", () => {
  it("removes the person's contacts, sessions and positions, and unlinks them from other people's contacts", async () => {
    const ready = async (phone: string, name: string) => {
      const user = await createTestUser(raw);
      created.push(user.id);
      await raw.auth.admin.updateUserById(user.id, {
        phone,
        phone_confirm: true,
      });
      await raw
        .from("user_info")
        .update({ full_name: name, country_code: "GH" })
        .eq("id", user.id);
      return user;
    };
    const leaver = await ready("233241110009", "Kwame Leaver");
    const keeper = await ready("233241110010", "Akosua Keeper");

    const added = await addSafetyContactCore(svc, leaver.id, {
      name: "Efua",
      dialCode: "+44",
      phone: UK.slice(3),
      email: null,
      relationship: "family",
      locale: "en",
    });
    expect(added.status).toBe(201);
    const sos = await startSafetySessionCore(
      svc,
      leaver.id,
      {
        kind: "sos",
        clientRequestId: crypto.randomUUID(),
        location: point(),
      },
      { createdVia: "app" },
    );
    expect(sos.status).toBe(201);
    const sessionId = must(sos.data).session.id;

    // The leaver is also someone else's trusted contact, linked to their
    // account.
    const theirs = await addSafetyContactCore(svc, keeper.id, {
      name: "Kwame",
      dialCode: "+233",
      phone: "241110009",
      email: null,
      relationship: "friend",
      locale: "en",
    });
    const theirId = must(theirs.data).id;
    await raw
      .from("safety_contact")
      .update({ contact_user_id: leaver.id, status: "accepted" })
      .eq("id", theirId);

    const { error } = await raw.rpc("anonymize_deleted_account", {
      p_user_id: leaver.id,
    });
    expect(error).toBeNull();

    const count = async (
      table: "safety_contact" | "safety_session" | "safety_message",
    ) =>
      (
        await raw
          .from(table)
          .select("id", { count: "exact", head: true })
          .eq("user_id", leaver.id)
      ).count;
    expect(await count("safety_contact")).toBe(0);
    expect(await count("safety_session")).toBe(0);
    expect(await count("safety_message")).toBe(0);
    const { count: positions } = await raw
      .from("safety_location")
      .select("id", { count: "exact", head: true })
      .eq("session_id", sessionId);
    expect(positions).toBe(0);

    const { data: kept } = await raw
      .from("safety_contact")
      .select("contact_user_id, name")
      .eq("id", theirId)
      .single();
    expect(kept).toEqual({ contact_user_id: null, name: "Kwame" });
  });
});

describe("switches, expiry and housekeeping", () => {
  it("a switched-off programme refuses new sessions but never strands an open one", async () => {
    await closeOpenSessions(person.id);
    const open = await startSafetySessionCore(
      svc,
      person.id,
      { kind: "share", clientRequestId: crypto.randomUUID(), hours: 1 },
      { createdVia: "app" },
    );
    expect(open.status).toBe(201);
    await setProgram({ enabled: false });
    const refused = await startSafetySessionCore(
      svc,
      person.id,
      { kind: "check_in", clientRequestId: crypto.randomUUID(), minutes: 30 },
      { createdVia: "app" },
    );
    expect(refused.status).toBe(403);
    const located = await recordSafetyLocationCore(svc, person.id, {
      sessionId: must(open.data).session.id,
      points: [point()],
    });
    expect(located.status).toBe(200);
    const ended = await resolveSafetySessionCore(svc, person.id, {
      sessionId: must(open.data).session.id,
      resolution: "ended",
    });
    expect(ended.data?.status).toBe("resolved");
    await setProgram({ enabled: true });
  });

  it("expires what ran out and deletes positions after the retention", async () => {
    await closeOpenSessions(person.id);
    const res = await startSafetySessionCore(
      svc,
      person.id,
      {
        kind: "share",
        clientRequestId: crypto.randomUUID(),
        hours: 1,
        location: point(),
      },
      { createdVia: "app" },
    );
    const id = must(res.data).session.id;
    await raw
      .from("safety_session")
      .update({ ends_at: new Date(Date.now() - 1000).toISOString() })
      .eq("id", id);
    await raw.rpc("safety_expire_sessions");
    const { data: expired } = await raw
      .from("safety_session")
      .select("status, resolution")
      .eq("id", id)
      .single();
    expect(expired).toEqual({ status: "expired", resolution: "ended" });

    await raw
      .from("safety_session")
      .update({
        resolved_at: new Date(Date.now() - 8 * 86_400_000).toISOString(),
      })
      .eq("id", id);
    await raw.rpc("safety_housekeeping");
    const { count } = await raw
      .from("safety_location")
      .select("id", { count: "exact", head: true })
      .eq("session_id", id);
    expect(count).toBe(0);
    const { data: cleared } = await raw
      .from("safety_session")
      .select("last_lat")
      .eq("id", id)
      .single();
    expect(cleared?.last_lat).toBeNull();
  });
});
