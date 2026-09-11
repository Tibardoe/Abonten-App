import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { apiJson } from "@/app/api/mobile/_lib/response";
import { logger } from "@abonten/core/logger";
import { getSupabaseServiceClient } from "@abonten/services/supabase/serviceClient";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import type { ZodSchema } from "zod";

// One handler shape for every /api/mobile/field-ops route: Bearer auth,
// input from the query string (GET) or JSON body (everything else) merged
// with the path params, validated by the shared zod schema, then the same
// @abonten/services/fieldOps core the web Server Action calls.

type Envelope = { status: number; message?: string; data?: unknown };

export async function fieldOpsRoute<T>(
  req: Request,
  opts: {
    schema: ZodSchema<T>;
    /** Path params merged into the input (e.g. { assignmentId }). */
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
