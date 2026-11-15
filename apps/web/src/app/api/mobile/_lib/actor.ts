import type { TeamCapability } from "@abonten/core/teams/roles";
import { getSupabaseServiceClient } from "@abonten/services/supabase/serviceClient";
import { resolveActingAccount } from "@abonten/services/teams/actingAccount";
import type { TeamRoleCode } from "@abonten/types/teamType";

// "Managing as" in the app (docs/architecture/team-accounts.md, stage 2):
// the app names the chosen team in this header on organizer and place
// requests. It only selects; the membership and the role are re-checked on
// every request (resolveActingAccount).
export const ACTING_TEAM_HEADER = "x-abonten-team";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * For a route that already proved the person: the account this request is
 * made for (their own, or the named team when their role covers
 * `capability`), or the 403 envelope to answer with.
 */
export async function mobileActingFor(
  req: Request,
  personId: string,
  capability: TeamCapability | readonly TeamCapability[],
): Promise<
  | { error: null; accountId: string; role: TeamRoleCode | null }
  | { error: { status: 403; message: string } }
> {
  const header = req.headers.get(ACTING_TEAM_HEADER)?.trim() ?? "";
  if (!UUID.test(header)) {
    return { error: null, accountId: personId, role: null };
  }
  const resolved = await resolveActingAccount(
    getSupabaseServiceClient(),
    personId,
    header,
    capability,
  );
  if (!resolved.ok) {
    return { error: { status: 403, message: resolved.error.message } };
  }
  return {
    error: null,
    accountId: resolved.actor.accountId,
    role: resolved.actor.role,
  };
}
