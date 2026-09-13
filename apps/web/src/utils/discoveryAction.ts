import { createClient } from "@/config/supabase/server";
import { getSupabaseServiceClient } from "@abonten/services/supabase/serviceClient";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import { headers } from "next/headers";
import type { ZodType, ZodTypeDef } from "zod";

// Shared plumbing for the Discovery Server Actions (src/actions/discovery/*).
// Search works signed out, so the caller may be anonymous; everything
// personal requires a session. Discovery tables have no client write grants,
// so the cores always receive the service-role client after identity is
// resolved here. The same cores serve /api/mobile/search, /discovery,
// /notifications/* and /recommendations.

export type DiscoveryCaller = { userId: string | null; svc: ServiceRoleClient };

export async function resolveDiscoveryCaller(): Promise<DiscoveryCaller> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { userId: user?.id ?? null, svc: getSupabaseServiceClient() };
}

export async function requireDiscoveryUser(): Promise<
  | { userId: string; svc: ServiceRoleClient; error: null }
  | { userId: null; svc: null; error: { status: 401; message: string } }
> {
  const caller = await resolveDiscoveryCaller();
  if (!caller.userId) {
    return {
      userId: null,
      svc: null,
      error: { status: 401, message: "Please sign in first." },
    };
  }
  return { userId: caller.userId, svc: caller.svc, error: null };
}

export function parseDiscoveryInput<T>(
  schema: ZodType<T, ZodTypeDef, unknown>,
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

/** Coarse abuse key for signed-out search. Never stored or used for anything else. */
export async function requestIp(): Promise<string> {
  const headerList = await headers();
  return (
    headerList.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headerList.get("x-real-ip") ||
    "unknown"
  );
}
