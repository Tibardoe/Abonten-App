import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { apiJson } from "@/app/api/mobile/_lib/response";
import { logger } from "@abonten/core/logger";
import { getSupabaseServiceClient } from "@abonten/services/supabase/serviceClient";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import type { ZodSchema } from "zod";

// One handler shape for every /api/mobile/verification route, mirroring the
// Field Ops one: Bearer auth, input from the query string (GET) or the JSON
// body merged with the path params, validated by the shared zod schema, then
// the same @abonten/services/verification core the web Server Action calls.
//
// The service-role client is what reaches the core because the verification
// tables carry no anon/authenticated privileges at all; the core re-checks
// that this caller owns the subject before touching anything.

type Envelope = { status: number; message?: string; data?: unknown };

export async function verificationRoute<T>(
  req: Request,
  opts: {
    schema: ZodSchema<T>;
    /** Path params merged into the input (e.g. { caseId }). */
    params?: Record<string, string>;
    label: string;
  },
  run: (svc: ServiceRoleClient, userId: string, data: T) => Promise<Envelope>,
) {
  const auth = await getMobileAuth(req);
  if (auth.response) return auth.response;

  try {
    let raw: Record<string, unknown>;
    if (req.method === "GET") {
      raw = Object.fromEntries(new URL(req.url).searchParams.entries());
    } else {
      const body = (await req.json().catch(() => null)) as unknown;
      raw =
        body && typeof body === "object"
          ? (body as Record<string, unknown>)
          : {};
    }
    const parsed = opts.schema.safeParse({ ...raw, ...(opts.params ?? {}) });
    if (!parsed.success) {
      return apiJson({
        status: 400,
        message: parsed.error.issues[0]?.message ?? "Invalid input",
      });
    }
    const result = await run(
      getSupabaseServiceClient(),
      auth.user.id,
      parsed.data,
    );
    return apiJson(result);
  } catch (error) {
    // Case ids only — never file names, notes or document contents.
    logger.error(`mobile ${opts.label} failed`, error);
    return apiJson({ status: 500, message: "Something went wrong!" });
  }
}

/** Awaits Next's params promise and returns it as a plain string record. */
export async function routeParams<K extends string>(
  params: Promise<Record<K, string>>,
): Promise<Record<K, string>> {
  return await params;
}
