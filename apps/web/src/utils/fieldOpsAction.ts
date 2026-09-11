import { createClient } from "@/config/supabase/server";
import { getSupabaseServiceClient } from "@abonten/services/supabase/serviceClient";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import type { ZodSchema } from "zod";

// Shared plumbing for the Field Ops Server Actions (src/actions/fieldOps/*).
// Every action resolves the caller from the cookie session, validates its
// input with the shared zod schema, then hands a service-role client to the
// @abonten/services/fieldOps core, which re-derives the caller's membership
// and role from the database before doing anything. The same cores serve
// the /api/mobile/field-ops routes.

export type FieldOpsCaller =
  | { userId: string; svc: ServiceRoleClient; error: null }
  | { userId: null; svc: null; error: { status: number; message: string } };

export async function resolveFieldOpsCaller(): Promise<FieldOpsCaller> {
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

export function parseFieldOpsInput<T>(
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
