import { logger } from "@abonten/core/logger";
import { tryFromMajor } from "@abonten/core/money/money";
import { teamRoleNeedsIdCheck } from "@abonten/core/teams/roles";
import type { Database } from "@abonten/types/database.types";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import type { SupabaseClient } from "@supabase/supabase-js";
import { tr } from "../i18n/requestLocale";
import { requireVerifiedIdentity } from "../identity/identityCore";
import { createNotificationCore } from "../notifications/createNotification";
import type { ActingAccount } from "./actingAccount";

// A team's money (docs/architecture/team-accounts.md, stage 3): the extra
// rules that apply when a member acts for a team on payouts. A person
// acting for themselves is untouched by everything here.

/** How recent a sign-in must be to change a team's payout account. */
export const FRESH_SIGN_IN_MINUTES = 15;

/**
 * When the person behind this session last proved who they are (the
 * newest `amr` timestamp of the verified access token), in ms; null when
 * it cannot be told. Pass the bearer token for an app request; the website
 * reads its cookie session.
 */
export async function signedInAt(
  supabase: SupabaseClient<Database>,
  jwt?: string,
): Promise<number | null> {
  try {
    const { data, error } = await supabase.auth.getClaims(jwt);
    if (error || !data) return null;
    const amr = (data.claims as { amr?: unknown }).amr;
    if (!Array.isArray(amr)) return null;
    const times = amr
      .map((entry) =>
        entry && typeof entry === "object" && "timestamp" in entry
          ? Number((entry as { timestamp: unknown }).timestamp)
          : Number.NaN,
      )
      .filter(Number.isFinite);
    return times.length ? Math.max(...times) * 1000 : null;
  } catch (error) {
    logger.error(`signedInAt: ${error}`);
    return null;
  }
}

export function isFreshSignIn(
  at: number | null,
  now: number = Date.now(),
): boolean {
  return at !== null && now - at <= FRESH_SIGN_IN_MINUTES * 60_000;
}

/**
 * Changing a team's payout account: the Owner signed in within the last
 * few minutes, and (when ID checks are required) has a live one (X5).
 * Null when the change may go ahead.
 */
export async function guardTeamPayoutAccountChange(
  svc: ServiceRoleClient,
  actor: ActingAccount,
  sessionSignedInAt: number | null,
): Promise<{ status: 403 | 409 | 500; message: string } | null> {
  if (!actor.role) return null;
  if (!isFreshSignIn(sessionSignedInAt)) {
    return { status: 403, message: tr("teamPayoutSignInAgain") };
  }
  return requireTeamMoneyIdentity(svc, actor);
}

/** An Owner or Finance member moving the team's money is ID-checked (X5). */
export async function requireTeamMoneyIdentity(
  svc: ServiceRoleClient,
  actor: ActingAccount,
): Promise<{ status: 409 | 500; message: string } | null> {
  if (!actor.role || !teamRoleNeedsIdCheck(actor.role)) return null;
  const gate = await requireVerifiedIdentity(svc, actor.personId, "payouts");
  if (!gate) return null;
  return {
    status: gate.status === 503 ? 500 : 409,
    message: gate.message ?? tr("somethingWentWrong"),
  };
}

export type TeamMoneyEvent =
  | { kind: "payout_account_added"; label: string }
  | { kind: "payout_account_removed"; label: string }
  | { kind: "payout_account_default"; label: string }
  | { kind: "payout_requested"; amount: number; currency: string }
  | { kind: "event_cancelled"; eventId: string; title: string };

const NOTICE_OF: Partial<Record<TeamMoneyEvent["kind"], string>> = {
  payout_account_added: "team_payout_account_added",
  payout_account_removed: "team_payout_account_removed",
  payout_account_default: "team_payout_account_default",
  payout_requested: "team_payout_requested",
};

/**
 * Records a money action in the team's activity and tells every Owner
 * (X6: every Owner hears of a payout account change and of a payout).
 * The notice is written to the team: the database copies it to the
 * members whose role covers it (Owners, for these). Best-effort: a failed
 * notice never undoes the action.
 */
export async function recordTeamMoneyEvent(
  svc: ServiceRoleClient,
  actor: ActingAccount,
  event: TeamMoneyEvent,
): Promise<void> {
  if (!actor.role) return;
  const teamId = actor.accountId;
  const details: Record<string, string | number> = {};
  let subject: { kind: string; id: string } | null = null;
  if ("label" in event) details.label = event.label;
  if (event.kind === "payout_requested") {
    details.amount = event.amount;
    details.currency = event.currency;
  }
  if (event.kind === "event_cancelled") {
    details.title = event.title;
    subject = { kind: "event", id: event.eventId };
  }
  const { error } = await svc.from("team_activity").insert({
    team_id: teamId,
    actor_user_id: actor.personId,
    action: event.kind,
    subject_kind: subject?.kind ?? null,
    subject_id: subject?.id ?? null,
    details,
  });
  if (error) logger.error(`recordTeamMoneyEvent activity: ${error.message}`);

  const notice = NOTICE_OF[event.kind];
  if (!notice) return;
  const [{ data: people }, { data: team }] = await Promise.all([
    svc
      .from("user_info")
      .select("full_name, username")
      .eq("id", actor.personId)
      .maybeSingle(),
    svc
      .from("user_info")
      .select("full_name, username")
      .eq("id", teamId)
      .maybeSingle(),
  ]);
  const params: Record<string, string | number> = {
    actor: people?.full_name?.trim() || people?.username || "",
    team: team?.full_name?.trim() || team?.username || "",
  };
  if ("label" in event) params.account = event.label;
  if (event.kind === "payout_requested") {
    const amount = tryFromMajor(event.amount, event.currency);
    if (amount) {
      params.amountMinor = amount.amountMinor;
      params.currency = amount.currency;
    }
  }
  await createNotificationCore(svc as SupabaseClient<Database>, {
    userId: teamId,
    type: notice,
    notice: { id: notice, params },
    link: "/finances",
    data: { kind: "team_money" },
  }).catch((e) => logger.error(`recordTeamMoneyEvent notice: ${e}`));
}
