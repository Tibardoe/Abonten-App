import { createClient } from "@/config/supabase/server";
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

export type VerificationCaller =
  | { userId: string; svc: ServiceRoleClient; error: null }
  | { userId: null; svc: null; error: { status: number; message: string } };

export async function resolveVerificationCaller(): Promise<VerificationCaller> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      userId: null,
      svc: null,
      error: { status: 401, message: "User not logged in" },
    };
  }
  return { userId: user.id, svc: getSupabaseServiceClient(), error: null };
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
        message: parsed.error.issues[0]?.message ?? "Invalid input",
      },
    };
  }
  return { data: parsed.data, error: null };
}
