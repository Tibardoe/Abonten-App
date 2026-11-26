import { logger } from "@abonten/core/logger";
import type { AdminContext } from "@abonten/types/adminTypes";
import type {
  ShowcaseAdminEntry,
  ShowcaseAdminView,
  ShowcaseCandidate,
  ShowcaseCounts,
  ShowcaseHiddenReason,
  ShowcaseSettings,
  ShowcaseSubjectKind,
} from "@abonten/types/showcaseType";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import type {
  ShowcaseAddInput,
  ShowcaseMoveInput,
  ShowcaseRemoveInput,
  ShowcaseSearchInput,
  ShowcaseSettingsInput,
  ShowcaseUpdateEntryInput,
} from "@abonten/validation/adminSchemas";
import {
  isShowcaseKillSwitchOn,
  mapShowcaseSettings,
  readShowcaseSettings,
  resetShowcaseSettingsCache,
} from "../../showcase/showcaseProgram";
import {
  type AdminEnvelope,
  adminError,
  assertPermission,
  recordAdminAudit,
} from "../adminContext";

// Admin › Showcase (docs/admin/showcase.md): who is on the "On Abonten" wall
// of each market. Reads need showcase.view; every change needs
// showcase.edit and is written to admin_audit_log; the programme settings
// also need a fresh sign-in (checked by the console's transport). Whether
// an entry shows is never stored: showcase_admin_entries() works it out on
// every read, with the reason when it does not. The console is English.

type RequestMeta = Record<string, unknown> | undefined;

const denied = <T>(e: unknown): AdminEnvelope<T> =>
  adminError(e) as AdminEnvelope<T>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const DB_ERRORS: Record<string, AdminEnvelope<never>> = {
  "showcase: already on this market's wall": {
    status: 409,
    message: "Already on this market's wall.",
  },
  "showcase: that place is in another market": {
    status: 400,
    message: "That place is in another market. Choose its own market first.",
  },
  "showcase: that account does not exist": {
    status: 404,
    message: "That account no longer exists.",
  },
  "showcase: that place does not exist": {
    status: 404,
    message: "That place no longer exists.",
  },
  "showcase: that city is not in this market": {
    status: 400,
    message: "That city is not in this market.",
  },
  "showcase: unknown market": { status: 400, message: "Unknown market." },
  "showcase: no such entry": {
    status: 404,
    message: "That entry was removed. Reload the page.",
  },
};

function dbError<T>(
  error: { message: string; code?: string } | null,
  context: string,
): AdminEnvelope<T> {
  const known = error
    ? Object.entries(DB_ERRORS).find(([key]) => error.message.includes(key))
    : undefined;
  if (known) return known[1] as AdminEnvelope<T>;
  if (error?.code === "23505") {
    return { status: 409, message: "Already on this market's wall." };
  }
  logger.error(`${context} failed: ${error?.message ?? "unknown error"}`);
  return { status: 500, message: "Something went wrong. Please try again." };
}

// ── Reading ──────────────────────────────────────────────────────────

type RawAdminEntry = {
  id: string;
  subject_kind: ShowcaseSubjectKind;
  subject_id: string;
  position: number;
  region_id: string | null;
  region_name: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
  reason: ShowcaseHiddenReason | null;
  name: string | null;
  username: string | null;
  slug: string | null;
  image_public_id: string | null;
  image_version: string | null;
  verified: boolean | null;
  is_team: boolean | null;
  next_event: {
    id: string;
    event_code: string;
    title: string;
    starts_at: string;
    timezone: string;
  } | null;
  counts: ShowcaseCounts | null;
};

const NO_COUNTS: ShowcaseCounts = {
  taps7: 0,
  follows7: 0,
  taps30: 0,
  follows30: 0,
  tapsAll: 0,
  followsAll: 0,
};

function mapEntry(raw: RawAdminEntry): ShowcaseAdminEntry {
  return {
    id: raw.id,
    subjectKind: raw.subject_kind,
    subjectId: raw.subject_id,
    position: raw.position,
    regionId: raw.region_id,
    regionName: raw.region_name,
    note: raw.note,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    reason: raw.reason,
    name: raw.name ?? "",
    username: raw.username,
    slug: raw.slug,
    imagePublicId: raw.image_public_id,
    imageVersion: raw.image_version,
    verified: !!raw.verified,
    isTeam: !!raw.is_team,
    nextEvent: raw.next_event
      ? {
          id: raw.next_event.id,
          eventCode: raw.next_event.event_code,
          title: raw.next_event.title,
          startsAt: raw.next_event.starts_at,
          timezone: raw.next_event.timezone,
        }
      : null,
    counts: raw.counts ?? NO_COUNTS,
  };
}

/** Every entry of a market, with whether it shows now and why not. */
export async function getShowcaseAdminViewCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
  input: { countryCode?: string | null },
): Promise<AdminEnvelope<ShowcaseAdminView>> {
  try {
    assertPermission(ctx, "showcase.view");
  } catch (e) {
    return denied(e);
  }
  const { data: markets, error: marketError } = await supabase
    .from("market")
    .select("country_code, name, status, is_default")
    .order("is_default", { ascending: false })
    .order("country_code");
  if (marketError) return dbError(marketError, "showcase markets");

  const list = (markets ?? []).map((m) => ({
    countryCode: m.country_code,
    name: m.name,
    status: m.status,
    isDefault: m.is_default,
  }));
  const asked = input.countryCode?.toUpperCase() ?? null;
  const countryCode =
    list.find((m) => m.countryCode === asked)?.countryCode ??
    list.find((m) => m.isDefault)?.countryCode ??
    list[0]?.countryCode;
  if (!countryCode) {
    return { status: 500, message: "No markets are set up." };
  }

  const [entries, cities] = await Promise.all([
    supabase.rpc("showcase_admin_entries", { p_country_code: countryCode }),
    supabase
      .from("market_region")
      .select("id, name, launch_status, position")
      .eq("country_code", countryCode)
      .eq("status", "active")
      .order("position")
      .order("name"),
  ]);
  if (entries.error) return dbError(entries.error, "showcase_admin_entries");
  if (cities.error) return dbError(cities.error, "showcase cities");

  const mapped = ((entries.data ?? []) as unknown as RawAdminEntry[]).map(
    mapEntry,
  );
  return {
    status: 200,
    data: {
      countryCode,
      markets: list,
      cities: (cities.data ?? []).map((c) => ({
        id: c.id,
        name: c.name,
        launchStatus: c.launch_status,
      })),
      entries: mapped,
      showing: {
        hosts: mapped.filter((e) => e.subjectKind === "host" && !e.reason)
          .length,
        places: mapped.filter((e) => e.subjectKind === "place" && !e.reason)
          .length,
      },
    },
  };
}

/**
 * Hosts and places to add: by name (the search rule), @handle, a profile
 * or place link, or an id. Each says whether it would show on this
 * market's wall now, and whether it is already on it.
 */
export async function searchShowcaseCandidatesCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
  input: ShowcaseSearchInput,
): Promise<AdminEnvelope<ShowcaseCandidate[]>> {
  try {
    assertPermission(ctx, "showcase.edit");
  } catch (e) {
    return denied(e);
  }
  const q = input.q.trim();
  const wantHosts = input.kind !== "place";
  const wantPlaces = input.kind !== "host";
  const found = new Map<string, ShowcaseCandidate>();
  const add = (c: Omit<ShowcaseCandidate, "reason" | "entryId">) => {
    const key = `${c.subjectKind}:${c.subjectId}`;
    if (!found.has(key)) found.set(key, { ...c, reason: null, entryId: null });
  };

  const profileLink = q.match(/\/user\/([A-Za-z0-9_]{3,30})/);
  const placeLink = q.match(/\/places\/([^/?#\s]+)/i);
  const handle = profileLink?.[1] ?? q.match(/^@([A-Za-z0-9_]{3,30})$/)?.[1];

  const hostColumns =
    "id, username, full_name, avatar_public_id, avatar_version, status_id";
  const placeColumns =
    "id, name, slug, country_code, cover_public_id, cover_version";
  type HostRow = {
    id: string;
    username: string | null;
    full_name: string | null;
    avatar_public_id: string | null;
    avatar_version: string | null;
    status_id: number;
  };
  type PlaceRow = {
    id: string;
    name: string;
    slug: string;
    country_code: string;
    cover_public_id: string | null;
    cover_version: string | null;
  };
  const addHost = (u: HostRow) => {
    if (u.status_id === 4) return;
    add({
      subjectKind: "host",
      subjectId: u.id,
      name: u.full_name?.trim() || (u.username ?? ""),
      username: u.username,
      slug: null,
      countryCode: null,
      imagePublicId: u.avatar_public_id,
      imageVersion: u.avatar_version,
    });
  };
  const addPlace = (p: PlaceRow) =>
    add({
      subjectKind: "place",
      subjectId: p.id,
      name: p.name,
      username: null,
      slug: p.slug,
      countryCode: p.country_code,
      imagePublicId: p.cover_public_id,
      imageVersion: p.cover_version,
    });

  if (UUID.test(q)) {
    const [hosts, places] = await Promise.all([
      wantHosts
        ? supabase.from("user_info").select(hostColumns).eq("id", q).limit(1)
        : null,
      wantPlaces
        ? supabase.from("place").select(placeColumns).eq("id", q).limit(1)
        : null,
    ]);
    for (const u of (hosts?.data ?? []) as HostRow[]) addHost(u);
    for (const p of (places?.data ?? []) as PlaceRow[]) addPlace(p);
  } else if (handle && wantHosts) {
    const { data } = await supabase
      .from("user_info")
      .select(hostColumns)
      .eq("username", handle)
      .limit(1);
    for (const u of (data ?? []) as HostRow[]) addHost(u);
  } else if (placeLink && wantPlaces) {
    const { data } = await supabase
      .from("place")
      .select(placeColumns)
      .eq("slug", decodeURIComponent(placeLink[1]))
      .limit(1);
    for (const p of (data ?? []) as PlaceRow[]) addPlace(p);
  }

  if (found.size === 0) {
    const types = [
      wantHosts ? "organizer" : null,
      wantPlaces ? "place" : null,
    ].filter((t): t is string => t !== null);
    const { data, error } = await supabase.rpc("search_suggest", {
      p_query: q,
      p_types: types,
    });
    if (error) return dbError(error, "search_suggest");
    const hostIds = (data ?? [])
      .filter((r) => r.entity_type === "organizer")
      .map((r) => r.id);
    const placeIds = (data ?? [])
      .filter((r) => r.entity_type === "place")
      .map((r) => r.id);
    const [hosts, places] = await Promise.all([
      hostIds.length
        ? supabase.from("user_info").select(hostColumns).in("id", hostIds)
        : null,
      placeIds.length
        ? supabase.from("place").select(placeColumns).in("id", placeIds)
        : null,
    ]);
    for (const u of (hosts?.data ?? []) as HostRow[]) addHost(u);
    for (const p of (places?.data ?? []) as PlaceRow[]) addPlace(p);
  }

  const candidates = [...found.values()].slice(0, 20);
  if (candidates.length === 0) return { status: 200, data: [] };

  const hostIds = candidates
    .filter((c) => c.subjectKind === "host")
    .map((c) => c.subjectId);
  const placeIds = candidates
    .filter((c) => c.subjectKind === "place")
    .map((c) => c.subjectId);
  const [check, existing] = await Promise.all([
    supabase.rpc("showcase_subject_check", {
      p_country_code: input.countryCode,
      p_host_ids: hostIds,
      p_place_ids: placeIds,
    }),
    supabase
      .from("showcase_entry")
      .select("id, subject_kind, subject_id")
      .eq("country_code", input.countryCode)
      .in(
        "subject_id",
        candidates.map((c) => c.subjectId),
      ),
  ]);
  if (check.error) return dbError(check.error, "showcase_subject_check");
  if (existing.error) return dbError(existing.error, "showcase entries");

  const reasons = new Map(
    (check.data ?? []).map((r) => [
      `${r.subject_kind}:${r.subject_id}`,
      (r.reason ?? null) as ShowcaseHiddenReason | null,
    ]),
  );
  const entries = new Map(
    (existing.data ?? []).map((r) => [
      `${r.subject_kind}:${r.subject_id}`,
      r.id,
    ]),
  );
  return {
    status: 200,
    data: candidates.map((c) => {
      const key = `${c.subjectKind}:${c.subjectId}`;
      return {
        ...c,
        reason: reasons.get(key) ?? null,
        entryId: entries.get(key) ?? null,
      };
    }),
  };
}

// ── Changing the wall ────────────────────────────────────────────────

async function readEntry(supabase: ServiceRoleClient, entryId: string) {
  return supabase
    .from("showcase_entry")
    .select(
      "id, subject_kind, subject_id, country_code, region_id, position, note",
    )
    .eq("id", entryId)
    .maybeSingle();
}

/** Put a host or a place on a market's wall, last in its order. */
export async function addShowcaseEntryCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
  input: ShowcaseAddInput,
  requestMeta?: RequestMeta,
): Promise<AdminEnvelope<{ id: string }>> {
  try {
    assertPermission(ctx, "showcase.edit");
  } catch (e) {
    return denied(e);
  }
  const { data, error } = await supabase.rpc("showcase_entry_add", {
    p_subject_kind: input.subjectKind,
    p_subject_id: input.subjectId,
    p_country_code: input.countryCode,
    p_region_id: input.regionId ?? null,
    p_note: input.note ?? null,
    p_actor: ctx.userId,
  } as never);
  if (error || !data) return dbError(error, "showcase_entry_add");
  const id = data as unknown as string;

  await recordAdminAudit(supabase, {
    actorId: ctx.userId,
    actorRoles: ctx.roles,
    action: "showcase.entry.add",
    targetType: "showcase_entry",
    targetId: id,
    summary: `Put a ${input.subjectKind} on the ${input.countryCode} On Abonten wall`,
    after: {
      subjectKind: input.subjectKind,
      subjectId: input.subjectId,
      countryCode: input.countryCode,
      regionId: input.regionId ?? null,
      note: input.note ?? null,
    },
    requestMeta: { ...(requestMeta ?? {}), roles: ctx.roles },
  });
  return { status: 200, message: "Added to the wall.", data: { id } };
}

/** Change an entry's city or note. */
export async function updateShowcaseEntryCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
  input: ShowcaseUpdateEntryInput,
  requestMeta?: RequestMeta,
): Promise<AdminEnvelope<undefined>> {
  try {
    assertPermission(ctx, "showcase.edit");
  } catch (e) {
    return denied(e);
  }
  const before = await readEntry(supabase, input.entryId);
  if (before.error) return dbError(before.error, "showcase entry read");
  if (!before.data) {
    return { status: 404, message: "That entry was removed. Reload the page." };
  }
  const note = input.note?.trim() ? input.note.trim() : null;
  if (
    before.data.region_id === (input.regionId ?? null) &&
    before.data.note === note
  ) {
    return { status: 400, message: "Nothing changed." };
  }
  const { error } = await supabase
    .from("showcase_entry")
    .update({
      region_id: input.regionId ?? null,
      note,
      updated_by: ctx.userId,
    })
    .eq("id", input.entryId);
  if (error) return dbError(error, "showcase entry update");

  await recordAdminAudit(supabase, {
    actorId: ctx.userId,
    actorRoles: ctx.roles,
    action: "showcase.entry.update",
    targetType: "showcase_entry",
    targetId: input.entryId,
    summary: "Changed an On Abonten wall entry",
    before: { regionId: before.data.region_id, note: before.data.note },
    after: { regionId: input.regionId ?? null, note },
    requestMeta: { ...(requestMeta ?? {}), roles: ctx.roles },
  });
  return { status: 200, message: "Saved." };
}

/** Move an entry one place up or down in its market's order. */
export async function moveShowcaseEntryCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
  input: ShowcaseMoveInput,
  requestMeta?: RequestMeta,
): Promise<AdminEnvelope<{ moved: boolean }>> {
  try {
    assertPermission(ctx, "showcase.edit");
  } catch (e) {
    return denied(e);
  }
  const { data, error } = await supabase.rpc("showcase_entry_move", {
    p_entry_id: input.entryId,
    p_direction: input.direction,
    p_actor: ctx.userId,
  });
  if (error) return dbError(error, "showcase_entry_move");
  const moved = data === true;
  if (moved) {
    await recordAdminAudit(supabase, {
      actorId: ctx.userId,
      actorRoles: ctx.roles,
      action: "showcase.entry.move",
      targetType: "showcase_entry",
      targetId: input.entryId,
      summary: `Moved an On Abonten wall entry ${input.direction}`,
      after: { direction: input.direction },
      requestMeta: { ...(requestMeta ?? {}), roles: ctx.roles },
    });
  }
  return { status: 200, data: { moved } };
}

/** Take an entry off the wall (its counts go with it). */
export async function removeShowcaseEntryCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
  input: ShowcaseRemoveInput,
  requestMeta?: RequestMeta,
): Promise<AdminEnvelope<undefined>> {
  try {
    assertPermission(ctx, "showcase.edit");
  } catch (e) {
    return denied(e);
  }
  const before = await readEntry(supabase, input.entryId);
  if (before.error) return dbError(before.error, "showcase entry read");
  if (!before.data) return { status: 200, message: "Already removed." };

  const { error } = await supabase
    .from("showcase_entry")
    .delete()
    .eq("id", input.entryId);
  if (error) return dbError(error, "showcase entry delete");

  await recordAdminAudit(supabase, {
    actorId: ctx.userId,
    actorRoles: ctx.roles,
    action: "showcase.entry.remove",
    targetType: "showcase_entry",
    targetId: input.entryId,
    summary: `Took a ${before.data.subject_kind} off the ${before.data.country_code} On Abonten wall`,
    before: {
      subjectKind: before.data.subject_kind,
      subjectId: before.data.subject_id,
      countryCode: before.data.country_code,
      regionId: before.data.region_id,
      position: before.data.position,
      note: before.data.note,
    },
    requestMeta: { ...(requestMeta ?? {}), roles: ctx.roles },
  });
  return { status: 200, message: "Removed from the wall." };
}

// ── Settings ─────────────────────────────────────────────────────────

export async function getShowcaseSettingsCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
): Promise<AdminEnvelope<{ settings: ShowcaseSettings; killSwitch: boolean }>> {
  try {
    assertPermission(ctx, "showcase.view");
  } catch (e) {
    return denied(e);
  }
  const row = await readShowcaseSettings(supabase, { fresh: true });
  if (!row) return { status: 500, message: "Couldn't load the settings." };
  return {
    status: 200,
    data: {
      settings: mapShowcaseSettings(row),
      killSwitch: isShowcaseKillSwitchOn(),
    },
  };
}

const COLUMN: Record<keyof ShowcaseSettingsInput["patch"], string> = {
  enabled: "enabled",
  audience: "audience",
  betaUserIds: "beta_user_ids",
  minPerRow: "min_per_row",
  maxPerRow: "max_per_row",
};

/**
 * The switch, the audience, beta testers and the row sizes. Needs
 * showcase.edit plus a fresh sign-in (the transport checks it), a reason,
 * and the row's last updated_at. Audited field by field.
 */
export async function updateShowcaseSettingsCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
  input: ShowcaseSettingsInput,
  requestMeta?: RequestMeta,
): Promise<AdminEnvelope<ShowcaseSettings>> {
  try {
    assertPermission(ctx, "showcase.edit");
  } catch (e) {
    return denied(e);
  }
  const beforeRow = await readShowcaseSettings(supabase, { fresh: true });
  if (!beforeRow) {
    return { status: 500, message: "Couldn't load the settings." };
  }
  const before = mapShowcaseSettings(beforeRow);

  const update: Record<string, unknown> = {};
  const changed: (keyof ShowcaseSettings)[] = [];
  for (const [key, value] of Object.entries(input.patch)) {
    const column = COLUMN[key as keyof typeof COLUMN];
    if (!column || value === undefined) continue;
    if (
      JSON.stringify(before[key as keyof ShowcaseSettings]) ===
      JSON.stringify(value)
    ) {
      continue;
    }
    update[column] = value;
    changed.push(key as keyof ShowcaseSettings);
  }
  if (changed.length === 0) return { status: 400, message: "Nothing changed." };

  const minPerRow = (input.patch.minPerRow ?? before.minPerRow) as number;
  const maxPerRow = (input.patch.maxPerRow ?? before.maxPerRow) as number;
  if (minPerRow > maxPerRow) {
    return {
      status: 400,
      message: "The fewest per row can't be more than the most per row.",
    };
  }

  update.updated_at = new Date().toISOString();
  update.updated_by = ctx.userId;

  const { data, error } = await supabase
    .from("showcase_program_setting")
    .update(update as never)
    .eq("id", 1)
    .eq("updated_at", input.expectedUpdatedAt)
    .select("*")
    .maybeSingle();
  if (error) {
    logger.error(`updateShowcaseSettingsCore failed: ${error.message}`);
    return { status: 500, message: "Couldn't save the settings." };
  }
  if (!data) {
    return {
      status: 409,
      message: "Someone else changed these settings. Reload and try again.",
    };
  }
  resetShowcaseSettingsCache();

  const after = mapShowcaseSettings(data);
  await recordAdminAudit(supabase, {
    actorId: ctx.userId,
    actorRoles: ctx.roles,
    action: "showcase.settings.update",
    targetType: "showcase_program_setting",
    targetId: "1",
    summary: `On Abonten settings changed: ${changed.join(", ")}`,
    reason: input.reason,
    before: Object.fromEntries(changed.map((k) => [k, before[k]])),
    after: Object.fromEntries(changed.map((k) => [k, after[k]])),
    requestMeta: { ...(requestMeta ?? {}), roles: ctx.roles },
  });
  return { status: 200, message: "Settings saved.", data: after };
}
