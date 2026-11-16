import { createClient } from "@/config/supabase/server";
import { actingFor } from "@/utils/teamActor";
import { tr } from "@abonten/services/i18n/requestLocale";
import { getSupabaseServiceClient } from "@abonten/services/supabase/serviceClient";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import type { ZodSchema } from "zod";

// Shared plumbing for the Trust & Verification Server Actions
// (src/actions/verification/*), mirroring utils/fieldOpsAction.ts.
//
// Every action resolves the caller from the cookie session, validates with
// the shared zod schema, then hands a SERVICE-ROLE client to the
// @abonten/services/verification core — which re-checks that the caller owns
// the subject before doing anything. The verification tables carry no
// anon/authenticated privileges at all, so the caller's own session client
// could not read or write them even if it were passed. The same cores serve
// the /api/mobile/verification routes.
//
// Managing as a team (docs/architecture/team-accounts.md §4h), the request
// is the team's when the person's role covers verification.request
// (Owners): `userId` is then the team and `personId` the person.

export type VerificationCaller =
  | { userId: string; personId: string; svc: ServiceRoleClient; error: null }
  | {
      userId: null;
      personId: null;
      svc: null;
      error: { status: number; message: string };
    };

export async function resolveVerificationCaller(
  options: {
    /** The person only (the programme's switches are the person's). */
    personal?: boolean;
  } = {},
): Promise<VerificationCaller> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      userId: null,
      personId: null,
      svc: null,
      error: { status: 401, message: tr("userNotLoggedIn") },
    };
  }
  const svc = getSupabaseServiceClient();
  if (options.personal) {
    return { userId: user.id, personId: user.id, svc, error: null };
  }
  const acting = await actingFor(user.id, "verification.request");
  if (acting.error) {
    return { userId: null, personId: null, svc: null, error: acting.error };
  }
  return { userId: acting.accountId, personId: user.id, svc, error: null };
}

export function parseVerificationInput<T>(
  schema: ZodSchema<T>,
  input: unknown,
):
  | { data: T; error: null }
  | { data: null; error: { status: 400; message: string } } {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return {
      data: null,
      error: {
        status: 400,
        message: parsed.error.issues[0]?.message ?? tr("invalidInput"),
      },
    };
  }
  return { data: parsed.data, error: null };
}
