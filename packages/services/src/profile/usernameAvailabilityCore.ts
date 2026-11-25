import { logger } from "@abonten/core/logger";
import { teamRoleCan } from "@abonten/core/teams/roles";
import {
  normalizeUsernameInput,
  sameUsername,
  suggestUsernames,
  usernameProblem,
} from "@abonten/core/usernames/usernames";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import type { TeamRoleCode } from "@abonten/types/teamType";
import type { UsernameAvailability } from "@abonten/types/usernameType";
import { tr } from "../i18n/requestLocale";
import { checkRateLimit } from "../security/rateLimit";

// "Is this username free?" as a person types (docs/architecture/
// team-accounts.md §4n): for a person's own Edit profile, a team's profile
// (its Owners) and the Make-a-team form, on the website (Server Action
// checkUsernameAvailability) and in the app (POST /api/mobile/usernames/
// check). It answers only for a well-formed handle (the same rule as the
// database, @abonten/core/usernames), says available or taken (a handle
// another account gave up in the last 30 days is held for it: taken), and
// offers two or three free handles built from the name or the typed one.
// Rate-limited per person so it cannot be used to list accounts quickly
// (each profile is public at /user/<handle> anyway). Saving still relies on
// the database's unique index and hold trigger: a race answers 409.

type Ok<T> = { status: 200; data: T };
type Fail = { status: 404 | 429 | 500; message: string };

/** Checks per person: a minute's typing, and an hour's. */
const PER_MINUTE = 30;
const PER_HOUR = 200;
const SHOWN = 3;

type Subject =
  /** The person's own handle. */
  | { kind: "person"; accountId: string }
  /** A team an Owner is editing. */
  | { kind: "team"; accountId: string }
  /** A team about to be made: nobody's handle is "theirs". */
  | { kind: "new_team"; accountId: null };

async function subjectFor(
  svc: ServiceRoleClient,
  userId: string,
  input: { teamId?: string | null; forNewTeam?: boolean },
): Promise<Subject | null> {
  if (input.teamId) {
    const { data } = await svc
      .from("team_member")
      .select("role")
      .eq("team_id", input.teamId)
      .eq("user_id", userId)
      .eq("status", "active")
      .maybeSingle();
    if (!data || !teamRoleCan(data.role as TeamRoleCode, "team.profile")) {
      return null;
    }
    return { kind: "team", accountId: input.teamId };
  }
  if (input.forNewTeam) return { kind: "new_team", accountId: null };
  return { kind: "person", accountId: userId };
}

/** A city the account is known in: one of the places it runs. */
async function cityOf(
  svc: ServiceRoleClient,
  accountId: string | null,
): Promise<string | null> {
  if (!accountId) return null;
  const { data } = await svc
    .from("place")
    .select("address")
    .eq("owner_id", accountId)
    .order("created_at", { ascending: true })
    .limit(5);
  for (const row of data ?? []) {
    const city = (row.address as { city?: unknown } | null)?.city;
    if (typeof city === "string" && city.trim()) return city.trim();
  }
  return null;
}

async function states(
  svc: ServiceRoleClient,
  usernames: string[],
  accountId: string | null,
): Promise<Map<string, string> | null> {
  const { data, error } = await svc.rpc("username_states", {
    p_usernames: usernames,
    // A team about to be made has no account yet: nothing is "its".
    p_for: (accountId ?? null) as string,
  });
  if (error) {
    logger.error(`username_states: ${error.message}`);
    return null;
  }
  return new Map(
    ((data ?? []) as { username: string; state: string }[]).map((r) => [
      r.username.toLowerCase(),
      r.state,
    ]),
  );
}

export async function checkUsernameAvailabilityCore(
  svc: ServiceRoleClient,
  userId: string,
  input: {
    username: string;
    /** A team the caller is an Owner of (its own handle counts as "yours"). */
    teamId?: string | null;
    /** The Make-a-team form: the handle is for a team not made yet. */
    forNewTeam?: boolean;
    /** The name typed beside it (Make-a-team), for suggestions. */
    name?: string | null;
  },
): Promise<Ok<UsernameAvailability> | Fail> {
  const handle = normalizeUsernameInput(input.username);
  const problem = usernameProblem(handle);
  if (problem) {
    return {
      status: 200,
      data: { username: handle, state: "invalid", problem, suggestions: [] },
    };
  }

  const [minute, hour] = await Promise.all([
    checkRateLimit(`username-check:${userId}`, PER_MINUTE, 60),
    checkRateLimit(`username-check-hour:${userId}`, PER_HOUR, 3600),
  ]);
  if (!minute || !hour) {
    return { status: 429, message: tr("usernameCheckTooFast") };
  }

  const subject = await subjectFor(svc, userId, input);
  if (!subject) return { status: 404, message: tr("teamNotFound") };

  const found = await states(svc, [handle], subject.accountId);
  if (!found) return { status: 500, message: tr("somethingWentWrong") };
  const state = found.get(handle.toLowerCase()) ?? "taken";
  if (state === "yours" || state === "available") {
    return {
      status: 200,
      data: {
        username: handle,
        state: state === "yours" ? "yours" : "available",
        problem: null,
        suggestions: [],
      },
    };
  }

  // Taken (or held for whoever gave it up): offer free ones.
  const { data: account } = subject.accountId
    ? await svc
        .from("user_info")
        .select("full_name, country_code")
        .eq("id", subject.accountId)
        .maybeSingle()
    : await svc
        .from("user_info")
        .select("full_name, country_code")
        .eq("id", userId)
        .maybeSingle();
  const candidates = suggestUsernames(
    {
      typed: handle,
      name:
        subject.kind === "new_team"
          ? (input.name ?? null)
          : (account?.full_name ?? null),
      city: await cityOf(svc, subject.accountId),
      country: account?.country_code ?? null,
      kind: subject.kind === "person" ? "person" : "team",
    },
    12,
  ).filter((c) => !sameUsername(c, handle));
  const free = candidates.length
    ? await states(svc, candidates, subject.accountId)
    : new Map<string, string>();
  const suggestions = candidates
    .filter((c) => free?.get(c.toLowerCase()) === "available")
    .slice(0, SHOWN);

  return {
    status: 200,
    data: { username: handle, state: "taken", problem: null, suggestions },
  };
}
